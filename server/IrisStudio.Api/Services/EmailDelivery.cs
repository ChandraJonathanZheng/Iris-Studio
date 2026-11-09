using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IrisStudio.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>
/// Sends one due outbox email per call (AlertDispatcher calls it in a loop). Before sending it re-checks the business
/// state (EmailGuard fields, preferences, consent), so a cancelled class gets no reminder and a paid student no
/// payment reminder. Failures retry with backoff, then the row is marked Failed. Logs carry ids and template keys only.
/// </summary>
public sealed class EmailDelivery(AppDbContext db, StudioClock clock, IEmailSender sender, EmailRenderer renderer,
    UnsubscribeLinks unsubscribe, IOptions<NotificationOptions> options, ILogger<EmailDelivery> log)
{
    public const int MaxAttempts = 10;

    public async Task<bool> DeliverNextAsync(CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = clock.UtcNow;
        // Row lock + skip-locked: several workers never send the same email.
        var claim = db.Database.IsSqlServer() ? (FormattableString)$"""
            SELECT TOP (1) * FROM [EmailMessages] WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
            WHERE [Status] = 'Queued' AND [SendAfterUtc] <= {now} AND ([NextAttemptUtc] IS NULL OR [NextAttemptUtc] <= {now})
            ORDER BY [SendAfterUtc]
            """ : $"""
            SELECT * FROM "EmailMessages"
            WHERE "Status" = 'Queued' AND "SendAfterUtc" <= {now} AND ("NextAttemptUtc" IS NULL OR "NextAttemptUtc" <= {now})
            ORDER BY "SendAfterUtc" LIMIT 1 FOR UPDATE SKIP LOCKED
            """;
        var m = (await db.EmailMessages.FromSqlInterpolated(claim).ToListAsync(ct)).FirstOrDefault();
        if (m is null) return false;

        var t = EmailTemplates.Exists(m.Template) ? EmailTemplates.Get(m.Template) : null;
        try
        {
            var data = JsonSerializer.Deserialize<Dictionary<string, string>>(m.Data) ?? [];
            var user = m.UserId is { } id ? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct) : null;
            var skip = t is null ? "unknown_template" : !options.Value.Enabled ? "disabled" : await SkipReasonAsync(m, t, user, data, ct);
            if (skip is not null)
            {
                Finish(m, t, EmailStatus.Skipped, skip);
                log.LogInformation("Email {EmailId} ({Template}) skipped: {Reason}.", m.Id, m.Template, skip);
            }
            else
            {
                var links = t!.Category == EmailCategory.Marketing ? unsubscribe.For(user!.Id) : default;
                var r = renderer.Render(t, data, links.Page);
                var headers = new Dictionary<string, string>();
                if (links.OneClick is not null)
                {
                    headers["List-Unsubscribe"] = $"<{links.OneClick}>";
                    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
                }
                await sender.SendAsync(new OutgoingEmail(m.Id, m.To, r.Subject, r.Html, r.Text, headers), ct);
                Finish(m, t, EmailStatus.Sent, null);
                m.SentAtUtc = clock.UtcNow;
                log.LogInformation("Email {EmailId} ({Template}) sent.", m.Id, m.Template);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            m.Attempts++;
            var outcome = ex.GetType().Name; // never the message: provider errors can echo addresses
            if (m.Attempts >= MaxAttempts) Finish(m, t, EmailStatus.Failed, outcome);
            else
            {
                m.Outcome = outcome;
                m.NextAttemptUtc = clock.UtcNow.AddSeconds(Math.Min(3600, 5 * Math.Pow(2, Math.Min(m.Attempts, 10))));
            }
            log.LogWarning("Email {EmailId} ({Template}) attempt {Attempt} failed ({Error}){Final}.", m.Id, m.Template, m.Attempts, outcome,
                m.Status == EmailStatus.Failed ? "; giving up" : "; retry scheduled");
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    private static void Finish(EmailMessage m, EmailTemplate? t, EmailStatus status, string? outcome)
    {
        m.Status = status;
        m.Outcome = outcome;
        m.NextAttemptUtc = null;
        // verify / reset links must not outlive their email
        if (t is null || t.Sensitive) m.Data = "{}";
    }

    private async Task<string?> SkipReasonAsync(EmailMessage m, EmailTemplate t, User? u, Dictionary<string, string> d, CancellationToken ct)
    {
        if (m.UserId is not null)
        {
            if (u is null || u.Declined) return "no_account";
            if (!string.Equals(u.Email, m.To, StringComparison.OrdinalIgnoreCase)) return "address_changed";
            if (t.Key == "password-reset" && string.IsNullOrWhiteSpace(u.PasswordHash)) return "password_login_unavailable";
            if (t.Preference == EmailPreference.Updates && !u.EmailUpdates) return "preference";
            if (t.Preference == EmailPreference.Reminders && !u.EmailReminders) return "preference";
            if (t.Category == EmailCategory.Marketing)
            {
                var consent = await db.ConsentRecords.AsNoTracking().Where(c => c.UserId == u.Id && c.Kind == ConsentKind.Marketing)
                    .OrderByDescending(c => c.CreatedAtUtc).FirstOrDefaultAsync(ct);
                if (consent?.Granted != true) return "no_consent";
            }
        }
        else if (t.Category == EmailCategory.Marketing) return "no_consent";

        if (d.TryGetValue(EmailGuard.ConsultId, out var consultKey))
        {
            if (!Guid.TryParse(consultKey, out var consultId)) return "consult_changed";
            var c = await db.Consults.AsNoTracking().FirstOrDefaultAsync(x => x.Id == consultId, ct);
            if (c is null || c.ContactType != "email" || !string.Equals(c.Contact, m.To, StringComparison.OrdinalIgnoreCase)
                || c.ScheduledDate is not { } date || c.ScheduledTime is not { } time
                || EmailFormat.SlotKey(date, time) != d.GetValueOrDefault(EmailGuard.ConsultSlot)
                || (c.ScheduleNote ?? "") != d.GetValueOrDefault("note") || clock.IsPast(date, time)) return "consult_changed";
        }

        if (d.TryGetValue(EmailGuard.LessonId, out var lid) && Guid.TryParse(lid, out var lessonId))
        {
            var l = await db.Lessons.AsNoTracking().FirstOrDefaultAsync(x => x.Id == lessonId, ct);
            if (l is null || l.Status.ToString() != d[EmailGuard.LessonStatus]) return "lesson_changed";
            if (l.Status == LessonStatus.Booked && (EmailFormat.SlotKey(l.Date, l.Time) != d[EmailGuard.LessonSlot] || clock.IsPast(l.Date, l.Time)))
                return "lesson_changed";
        }
        if (d.TryGetValue(EmailGuard.ChangeId, out var cid) && Guid.TryParse(cid, out var changeId)
            && await db.ChangeRequests.AsNoTracking().Where(c => c.Id == changeId).Select(c => (ChangeStatus?)c.Status).FirstOrDefaultAsync(ct) is var cs
            && cs?.ToString() != d[EmailGuard.ChangeStatus]) return "change_changed";
        if (d.TryGetValue(EmailGuard.PaymentId, out var pid) && Guid.TryParse(pid, out var paymentId)
            && await db.Payments.AsNoTracking().Where(p => p.Id == paymentId).Select(p => (PaymentStatus?)p.Status).FirstOrDefaultAsync(ct) is var ps
            && ps?.ToString() != d[EmailGuard.PaymentStatus]) return "payment_changed";
        if (d.TryGetValue(EmailGuard.TokenId, out var tid) && Guid.TryParse(tid, out var tokenId)
            && !await db.AuthTokens.AnyAsync(x => x.Id == tokenId && x.UsedAtUtc == null && x.ExpiresAtUtc > clock.UtcNow, ct)) return "link_expired";

        if (t.Key == "payment-reminder" && u is not null && await db.Payments.AnyAsync(p => p.StudentId == u.Id && p.Status != PaymentStatus.Rejected
                && (p.UploadedAtUtc >= m.CreatedAtUtc || p.DecidedAtUtc >= m.CreatedAtUtc), ct)) return "already_paid";
        if (t.Key == "credits-low" && u is not null && int.TryParse(d.GetValueOrDefault("credits"), out var low) && u.Credits > low) return "credits_added";
        return null;
    }
}

/// <summary>24-hour class reminders, queued by StudioMaintenance once a minute. The slot is part of the dedupe key,
/// so a rescheduled class gets a reminder for its new time, and the send-time guard drops the old one.</summary>
public static class ClassReminders
{
    public static async Task QueueAsync(AppDbContext db, StudioClock clock, AlertService alerts, StudioOptions o, CancellationToken ct)
    {
        var today = clock.Today;
        var lessons = await db.Lessons.Include(l => l.Student)
            .Where(l => l.Status == LessonStatus.Booked && l.Date >= today && l.Date <= today.AddDays(1)).ToListAsync(ct);
        foreach (var l in lessons)
        {
            var start = clock.ToUtc(l.Date, l.Time);
            var lead = start - clock.UtcNow;
            // Not for a class starting within the hour, and not for one booked less than a day ahead (its confirmation just went out).
            if (lead <= TimeSpan.FromHours(1) || lead > TimeSpan.FromHours(24) || start - l.CreatedAtUtc <= TimeSpan.FromHours(24)) continue;
            await alerts.EmailAsync(l.Student, "class-reminder", EmailFormat.Lesson(l, o, LessonStatus.Booked),
                $"reminder:{l.Id}:{EmailFormat.SlotKey(l.Date, l.Time)}", delay: false, ct: ct);
        }
    }
}

/// <summary>Signed, non-guessable unsubscribe links for marketing email (no login needed, one click).</summary>
public sealed class UnsubscribeLinks(IDataProtectionProvider protection, IOptions<NotificationOptions> options)
{
    private readonly IDataProtector _protector = protection.CreateProtector("IrisStudio.Unsubscribe.v1");

    public (string? Page, string? OneClick) For(Guid userId)
    {
        var token = Uri.EscapeDataString(_protector.Protect(userId.ToString("N")));
        var site = EmailRenderer.BaseUrl(options.Value);
        return ($"{site}/unsubscribe?t={token}", $"{site}/api/public/unsubscribe?t={token}");
    }

    public Guid? Read(string? token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 500) return null;
        try { return Guid.TryParseExact(_protector.Unprotect(token), "N", out var id) ? id : null; }
        catch (CryptographicException) { return null; }
    }
}

/// <summary>
/// Email verification and password reset links. The raw token lives only in the email; the database keeps its SHA-256.
/// A new link cancels older ones of the same kind, a link works once, and requests are throttled per account.
/// </summary>
public sealed class AccountTokens(AppDbContext db, StudioClock clock, AlertService alerts)
{
    public static readonly TimeSpan VerifyLifetime = TimeSpan.FromHours(48);
    public static readonly TimeSpan ResetLifetime = TimeSpan.FromMinutes(60);
    public static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(2);

    /// <summary>Queues a verification email (caller saves). False when there is nothing to verify or one was just sent.</summary>
    public async Task<bool> SendVerificationAsync(User u, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(u.Email) || u.EmailVerified || await RecentAsync(u.Id, AuthTokenPurpose.VerifyEmail, ct)) return false;
        var (token, raw) = await IssueAsync(u, AuthTokenPurpose.VerifyEmail, VerifyLifetime, ct);
        await alerts.EmailAsync(u, "verify-email", new()
        {
            ["email"] = u.Email, ["expiresIn"] = "48 小時", ["verifyUrl"] = $"/verify-email?token={raw}", [EmailGuard.TokenId] = token.Id.ToString(),
        }, $"verify:{token.Id}", delay: false, ct: ct);
        return true;
    }

    public async Task<bool> SendResetAsync(User u, CancellationToken ct)
    {
        if (u.Declined || string.IsNullOrWhiteSpace(u.Email) || string.IsNullOrWhiteSpace(u.PasswordHash)
            || await RecentAsync(u.Id, AuthTokenPurpose.ResetPassword, ct)) return false;
        var (token, raw) = await IssueAsync(u, AuthTokenPurpose.ResetPassword, ResetLifetime, ct);
        await alerts.EmailAsync(u, "password-reset", new()
        {
            ["expiresIn"] = "60 分鐘", ["resetUrl"] = $"/reset-password?token={raw}", [EmailGuard.TokenId] = token.Id.ToString(),
        }, $"reset:{token.Id}", delay: false, ct: ct);
        return true;
    }

    public async Task<User?> ValidateResetAsync(string? raw, CancellationToken ct) =>
        (await ReadAsync(raw, AuthTokenPurpose.ResetPassword, ct))?.User;

    private async Task<(AuthToken Token, User User)?> ReadAsync(string? raw, AuthTokenPurpose purpose, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Length > 100) return null;
        var hash = Hash(raw);
        var now = clock.UtcNow;
        var t = await db.AuthTokens.AsNoTracking().FirstOrDefaultAsync(x => x.TokenHash == hash && x.Purpose == purpose, ct);
        if (t is null || t.UsedAtUtc is not null || t.ExpiresAtUtc <= now) return null;
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == t.UserId, ct);
        // An email change after the link was sent makes the link useless.
        if (u is null || u.Declined || !string.Equals(u.Email, t.Email, StringComparison.OrdinalIgnoreCase)) return null;
        if (purpose == AuthTokenPurpose.ResetPassword && string.IsNullOrWhiteSpace(u.PasswordHash)) return null;
        return (t, u);
    }

    /// <summary>Marks the token used atomically. Password reset callers commit this together with the password change.</summary>
    public async Task<User?> ConsumeAsync(string? raw, AuthTokenPurpose purpose, CancellationToken ct)
    {
        if (await ReadAsync(raw, purpose, ct) is not { } link) return null;
        var (t, u) = link;
        var now = clock.UtcNow;
        var claimed = await db.AuthTokens.Where(x => x.Id == t.Id && x.UsedAtUtc == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAtUtc, now), ct);
        return claimed == 1 ? u : null;
    }

    /// <summary>After a password change: every other reset link stops working.</summary>
    public Task RevokeAsync(Guid userId, AuthTokenPurpose purpose, CancellationToken ct) =>
        db.AuthTokens.Where(t => t.UserId == userId && t.Purpose == purpose && t.UsedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAtUtc, clock.UtcNow), ct);

    private Task<bool> RecentAsync(Guid userId, AuthTokenPurpose purpose, CancellationToken ct)
    {
        var since = clock.UtcNow - Cooldown;
        return db.AuthTokens.AnyAsync(t => t.UserId == userId && t.Purpose == purpose && t.CreatedAtUtc > since, ct);
    }

    private async Task<(AuthToken token, string raw)> IssueAsync(User u, AuthTokenPurpose purpose, TimeSpan lifetime, CancellationToken ct)
    {
        await RevokeAsync(u.Id, purpose, ct); // only the newest link works
        var raw = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var now = clock.UtcNow;
        var token = new AuthToken { UserId = u.Id, Purpose = purpose, TokenHash = Hash(raw), Email = u.Email, CreatedAtUtc = now, ExpiresAtUtc = now + lifetime };
        db.AuthTokens.Add(token);
        return (token, raw);
    }

    private static string Hash(string raw) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
}
