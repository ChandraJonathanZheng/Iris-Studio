using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>
/// The one place alerts are created. Alerts caused by Iris's decisions are delayed (SendAfterUtc) so
/// "Undo" can delete them before the student sees them — no "approved… actually declined" messages.
/// </summary>
public class AlertService(AppDbContext db, StudioClock clock, IOptions<StudioOptions> opt)
{
    public void Add(Guid userId, AlertKind kind, string title, string body, string? source = null, bool delay = true) =>
        db.Alerts.Add(new Alert
        {
            UserId = userId, Kind = kind, Title = title, Body = body, Source = source,
            CreatedAtUtc = clock.UtcNow,
            SendAfterUtc = delay ? clock.UtcNow.AddSeconds(opt.Value.AlertDelaySeconds) : clock.UtcNow,
        });

    /// <summary>Delete alerts from this source that haven't been released yet (used by undo).</summary>
    public Task DropQueuedAsync(string source, CancellationToken ct = default) =>
        db.Alerts.Where(a => a.Source == source && a.SendAfterUtc > clock.UtcNow).ExecuteDeleteAsync(ct);

    /// <summary>Alerts the user may see now.</summary>
    public IQueryable<Alert> Visible(Guid userId) =>
        db.Alerts.Where(a => a.UserId == userId && a.SendAfterUtc <= clock.UtcNow);
}

/// <summary>Where a due alert goes besides the in-app list. Plug LINE Messaging or email in here.</summary>
public interface IAlertChannel
{
    Task SendAsync(User user, Alert alert, CancellationToken ct);
}

/// <summary>Default: in-app only (PRD §9 Q2). Replace with a LINE push channel once the OA is set up.</summary>
public class InAppOnlyChannel : IAlertChannel
{
    public Task SendAsync(User user, Alert alert, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>Outbox worker: every few seconds, releases alerts whose delay has passed.</summary>
public class AlertDispatcher(IServiceScopeFactory scopes, ILogger<AlertDispatcher> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stop))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var clock = scope.ServiceProvider.GetRequiredService<StudioClock>();
                var channel = scope.ServiceProvider.GetRequiredService<IAlertChannel>();
                var due = await db.Alerts.Where(a => a.DeliveredAtUtc == null && a.SendAfterUtc <= clock.UtcNow)
                    .OrderBy(a => a.SendAfterUtc).Take(50).ToListAsync(stop);
                foreach (var a in due)
                {
                    var user = await db.Users.FindAsync([a.UserId], stop);
                    if (user is not null) await channel.SendAsync(user, a, stop);
                    a.DeliveredAtUtc = clock.UtcNow;
                }
                if (due.Count > 0) await db.SaveChangesAsync(stop);

                // housekeeping: idempotency keys only need to live for a day
                await db.IdempotencyRecords.Where(r => r.CreatedAtUtc < clock.UtcNow.AddDays(-1)).ExecuteDeleteAsync(stop);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Alert dispatch failed; will retry.");
            }
        }
    }
}
