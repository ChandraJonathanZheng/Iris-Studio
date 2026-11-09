using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>
/// The one place notifications are created: in-app alerts (+ LINE) and emails. Both are rows written in the caller's
/// transaction (outbox), so nothing is sent unless the business change commits. Undoable decisions are delayed
/// (SendAfterUtc) so "Undo" can delete them before anyone sees them — no "approved… actually declined" messages.
/// </summary>
public class AlertService(AppDbContext db, StudioClock clock, IOptions<StudioOptions> opt)
{
    /// <summary>Undoable emails wait until the undo window has passed, so an undo always catches them.</summary>
    private TimeSpan EmailDelay => TimeSpan.FromSeconds(Math.Max(opt.Value.AlertDelaySeconds, opt.Value.UndoSeconds + 5));

    /// <summary>
    /// Queues a template email to a user (skipped when they have no email). <paramref name="dedupeKey"/> names the
    /// business event: the same event never emails twice. <paramref name="source"/> lets DropQueuedAsync (undo) remove it.
    /// </summary>
    public Task EmailAsync(User user, string template, Dictionary<string, string> data, string dedupeKey, string? source = null, bool delay = true, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(user.Email)) return Task.CompletedTask;
        data["recipientName"] = user.Name;
        return QueueAsync(user.Id, user.Email, template, data, dedupeKey, source, delay, ct);
    }

    public async Task EmailAsync(Guid userId, string template, Dictionary<string, string> data, string dedupeKey, string? source = null, bool delay = true, CancellationToken ct = default)
    {
        if (await db.Users.FindAsync([userId], ct) is { } user) await EmailAsync(user, template, data, dedupeKey, source, delay, ct);
    }

    /// <summary>Iris's own notifications (new student, receipt, request, consult). Sent at once.</summary>
    public async Task EmailTeacherAsync(string template, Dictionary<string, string> data, string dedupeKey, CancellationToken ct = default)
    {
        var teacher = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Role == Role.Teacher, ct);
        if (teacher is not null) await EmailAsync(teacher, template, data, dedupeKey, delay: false, ct: ct);
    }

    /// <summary>Someone without an account (consult applicant). Only account-free templates are allowed.</summary>
    public Task EmailGuestAsync(string to, string name, string template, Dictionary<string, string> data, string dedupeKey, CancellationToken ct = default)
    {
        if (EmailTemplates.Get(template).Audience != EmailAudience.Guest) throw new InvalidOperationException($"'{template}' needs an account.");
        data["recipientName"] = name;
        return QueueAsync(null, to, template, data, dedupeKey, null, false, ct);
    }

    private async Task QueueAsync(Guid? userId, string to, string template, Dictionary<string, string> data, string dedupeKey, string? source, bool delay, CancellationToken ct)
    {
        var t = EmailTemplates.Get(template);
        if (db.EmailMessages.Local.Any(m => m.DedupeKey == dedupeKey) || await db.EmailMessages.AnyAsync(m => m.DedupeKey == dedupeKey, ct)) return;
        db.EmailMessages.Add(new EmailMessage
        {
            UserId = userId, To = to, Template = t.Key, Category = t.Category, DedupeKey = dedupeKey, Source = source,
            Data = System.Text.Json.JsonSerializer.Serialize(data),
            CreatedAtUtc = clock.UtcNow, SendAfterUtc = delay ? clock.UtcNow.Add(EmailDelay) : clock.UtcNow,
        });
    }

    public void Add(Guid userId, AlertKind kind, string title, string body, string? source = null, bool delay = true) =>
        db.Alerts.Add(new Alert
        {
            UserId = userId, Kind = kind, Title = title, Body = body, Source = source,
            CreatedAtUtc = clock.UtcNow,
            SendAfterUtc = delay ? clock.UtcNow.AddSeconds(opt.Value.AlertDelaySeconds) : clock.UtcNow,
        });

    /// <summary>Delete alerts and emails from this source that haven't been released yet (used by undo).</summary>
    public async Task<int> DropQueuedAsync(string source, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        // queued earlier in this same unit of work (not saved yet): just don't insert them
        foreach (var queued in db.ChangeTracker.Entries<EmailMessage>().Where(e => e.State == EntityState.Added && e.Entity.Source == source).ToList())
            queued.State = EntityState.Detached;
        return await db.Alerts.Where(a => a.Source == source && a.DeliveredAtUtc == null && a.SendAfterUtc > now).ExecuteDeleteAsync(ct)
             + await db.EmailMessages.Where(m => m.Source == source && m.Status == EmailStatus.Queued && m.SendAfterUtc > now).ExecuteDeleteAsync(ct);
    }

    /// <summary>Alerts the user may see now.</summary>
    public IQueryable<Alert> Visible(Guid userId) =>
        db.Alerts.Where(a => a.UserId == userId && a.SendAfterUtc <= clock.UtcNow);
}

/// <summary>Where a due alert goes besides the in-app list. Plug LINE Messaging or email in here.</summary>
public interface IAlertChannel
{
    Task SendAsync(User user, Alert alert, CancellationToken ct);
}

/// <summary>Claims one outbox row per transaction, saving each delivery independently.</summary>
public class AlertDispatcher(IServiceScopeFactory scopes, ILogger<AlertDispatcher> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stop))
        {
            try { await DispatchAsync(stop); }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex) { log.LogError(ex, "Alert dispatch failed; will retry."); }
        }
    }

    public async Task DispatchAsync(CancellationToken ct)
    {
        for (var i = 0; i < 50; i++)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var clock = scope.ServiceProvider.GetRequiredService<StudioClock>();
            var channel = scope.ServiceProvider.GetRequiredService<IAlertChannel>();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Multiple workers cannot deliver the same row concurrently. Undo only deletes unreleased rows.
            var claimQuery = db.Database.IsSqlServer() ? (FormattableString)$"""
                SELECT TOP (1) * FROM [Alerts] WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
                WHERE [DeliveredAtUtc] IS NULL AND [SendAfterUtc] <= {clock.UtcNow}
                  AND ([NextAttemptUtc] IS NULL OR [NextAttemptUtc] <= {clock.UtcNow})
                ORDER BY [SendAfterUtc]
                """ : $"""
                SELECT * FROM "Alerts"
                WHERE "DeliveredAtUtc" IS NULL AND "SendAfterUtc" <= {clock.UtcNow}
                  AND ("NextAttemptUtc" IS NULL OR "NextAttemptUtc" <= {clock.UtcNow})
                ORDER BY "SendAfterUtc" LIMIT 1 FOR UPDATE SKIP LOCKED
                """;
            var due = await db.Alerts.FromSqlInterpolated(claimQuery).ToListAsync(ct);
            if (due.Count == 0) break;
            var alert = due[0];
            try
            {
                var user = await db.Users.FindAsync([alert.UserId], ct);
                if (user is not null && !user.Declined) await channel.SendAsync(user, alert, ct);
                alert.DeliveredAtUtc = clock.UtcNow;
                alert.NextAttemptUtc = null;
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                alert.DeliveryAttempts++;
                alert.NextAttemptUtc = clock.UtcNow.AddSeconds(Math.Min(3600, 5 * Math.Pow(2, Math.Min(alert.DeliveryAttempts, 10))));
                log.LogWarning(ex, "Delivery of alert {AlertId} failed; retry scheduled.", alert.Id);
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        for (var i = 0; i < 50; i++)
        {
            using var scope = scopes.CreateScope();
            if (!await scope.ServiceProvider.GetRequiredService<EmailDelivery>().DeliverNextAsync(ct)) break;
        }
    }
}

/// <summary>Attendance and daily idempotency cleanup run independently of external delivery failures.</summary>
public sealed class StudioMaintenance(IServiceScopeFactory scopes, ILogger<StudioMaintenance> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        DateOnly? lastCleanup = null;
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var clock = scope.ServiceProvider.GetRequiredService<StudioClock>();
                await using var tx = await Infrastructure.StudioTransaction.BeginAsync(db, stop);
                await AttendanceSettler.RunAsync(db, clock, stop);
                await ClassReminders.QueueAsync(db, clock, scope.ServiceProvider.GetRequiredService<AlertService>(),
                    scope.ServiceProvider.GetRequiredService<IOptions<StudioOptions>>().Value, stop);
                await db.SaveChangesAsync(stop);
                if (lastCleanup != clock.Today)
                    await db.IdempotencyRecords.Where(r => r.CreatedAtUtc < clock.UtcNow.AddDays(-1)).ExecuteDeleteAsync(stop);
                await tx.CommitAsync(stop);
                lastCleanup = clock.Today;
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex) { log.LogError(ex, "Studio maintenance failed; will retry."); }
        } while (await timer.WaitForNextTickAsync(stop));
    }
}
