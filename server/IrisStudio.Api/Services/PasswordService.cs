using System.Security.Cryptography;
using System.Text;
using IrisStudio.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>Sends an email. Today only <see cref="LogEmailSender"/> exists; plug Resend in once Iris's account is set up.</summary>
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string text, CancellationToken ct);
}

/// <summary>Development stand-in: writes the email to the log instead of sending it (so the reset link can be copied from the console).</summary>
public class LogEmailSender(ILogger<LogEmailSender> log) : IEmailSender
{
    public Task SendAsync(string to, string subject, string text, CancellationToken ct)
    {
        log.LogWarning("EMAIL (not sent, no provider configured) to {To}: {Subject}\n{Text}", to, subject, text);
        return Task.CompletedTask;
    }
}

/// <summary>
/// Password rules + 忘記密碼. The flow never tells anyone whether an email is registered (same answer either way),
/// links are random, single-use, short-lived and stored only as a hash, and a new password can't repeat the last 3.
/// </summary>
public class PasswordService(AppDbContext db, PasswordHasher<User> hasher, IEmailSender email, StudioClock clock, IOptions<StudioOptions> options)
{
    private readonly StudioOptions _o = options.Value;
    public const int HistorySize = 3;

    /// <summary>Same rule as the client (lib/password.ts): ≥ 8 characters, an upper-case letter, a lower-case letter and a number.</summary>
    public static string? RuleProblem(string? pw) =>
        pw is null || pw.Length < 8 || !pw.Any(char.IsAsciiLetterUpper) || !pw.Any(char.IsAsciiLetterLower) || !pw.Any(char.IsAsciiDigit)
            ? "密碼至少 8 個字元，需包含大寫字母、小寫字母和數字。" : null;

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>Sets a password and records it in the history (keeps the newest <see cref="HistorySize"/>). Caller saves.</summary>
    public async Task SetPasswordAsync(User u, string password, CancellationToken ct)
    {
        u.PasswordHash = hasher.HashPassword(u, password);
        db.PasswordHistories.Add(new PasswordHistory { UserId = u.Id, PasswordHash = u.PasswordHash, CreatedAtUtc = clock.UtcNow });
        var old = await db.PasswordHistories.Where(h => h.UserId == u.Id).OrderByDescending(h => h.CreatedAtUtc).Skip(HistorySize - 1).ToListAsync(ct);
        db.PasswordHistories.RemoveRange(old);
    }

    /// <summary>Always "ok" to the caller. Only an existing email account with a password gets a link (LINE-only accounts have none).</summary>
    public async Task RequestResetAsync(string? rawEmail, CancellationToken ct)
    {
        var addr = (rawEmail ?? "").Trim().ToLowerInvariant();
        var u = await db.Users.FirstOrDefaultAsync(x => x.Email == addr && x.PasswordHash != null && !x.Declined, ct);
        if (u is null) return;
        // one link per minute per account, so the form can't be used to flood someone's inbox
        if (await db.PasswordResetTokens.AnyAsync(t => t.UserId == u.Id && t.CreatedAtUtc > clock.UtcNow.AddMinutes(-1), ct)) return;

        // asking again cancels older links
        await db.PasswordResetTokens.Where(t => t.UserId == u.Id && t.UsedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAtUtc, clock.UtcNow), ct);
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        db.PasswordResetTokens.Add(new PasswordResetToken { UserId = u.Id, TokenHash = Hash(token), ExpiresAtUtc = clock.UtcNow.AddMinutes(_o.ResetLinkMinutes) });
        await db.SaveChangesAsync(ct);

        var link = $"{_o.PublicUrl.TrimEnd('/')}/reset-password?token={token}";
        await email.SendAsync(addr, "Iris 聲樂工作室｜重設密碼",
            $"{u.Name} 你好：\n\n請在 {_o.ResetLinkMinutes} 分鐘內打開下面的連結設定新密碼（只能使用一次）：\n{link}\n\n如果不是你本人申請，請忽略這封信，你的密碼不會改變。", ct);
    }

    private Task<PasswordResetToken?> FindAsync(string? token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 100) return Task.FromResult<PasswordResetToken?>(null);
        var h = Hash(token);
        return db.PasswordResetTokens.FirstOrDefaultAsync(t => t.TokenHash == h && t.UsedAtUtc == null && t.ExpiresAtUtc > clock.UtcNow, ct);
    }

    public async Task<bool> IsValidAsync(string? token, CancellationToken ct) => await FindAsync(token, ct) is not null;

    public async Task ResetAsync(string? token, string? password, CancellationToken ct)
    {
        var t = await FindAsync(token, ct) ?? throw new BizException(410, "link_invalid", "這個連結已失效或已使用過，請重新申請重設密碼。");
        if (RuleProblem(password) is { } bad) throw new BizException(400, "validation", bad);
        var u = await db.Users.FirstAsync(x => x.Id == t.UserId, ct);
        var recent = await db.PasswordHistories.Where(h => h.UserId == u.Id).OrderByDescending(h => h.CreatedAtUtc).Take(HistorySize).Select(h => h.PasswordHash).ToListAsync(ct);
        if (u.PasswordHash is not null && !recent.Contains(u.PasswordHash)) recent.Insert(0, u.PasswordHash); // accounts from before the history existed
        if (recent.Take(HistorySize).Any(h => hasher.VerifyHashedPassword(u, h, password!) != PasswordVerificationResult.Failed))
            throw new BizException(409, "password_reused", $"新密碼不能和最近 {HistorySize} 次用過的密碼相同。");
        await SetPasswordAsync(u, password!, ct);
        t.UsedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}
