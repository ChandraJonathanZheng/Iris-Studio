using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

public static class PublicAuthEndpoints
{
    public static void MapPublicAndAuth(this IEndpointRouteBuilder app)
    {
        var pub = app.MapGroup("/api/public");

        pub.MapGet("/studio", async (IOptions<StudioOptions> o, AvailabilityService availability, AppDbContext db, CancellationToken ct) =>
        {
            var t = await db.Users.AsNoTracking().FirstAsync(u => u.Role == Role.Teacher, ct);
            var teacher = new TeacherPublicDto(t.Name, t.AvatarUrl, t.TeacherStatus.Camel(), t.StatusLabel, t.StatusMessage, t.LineIdPublic ? t.LineId : null);
            return TypedResults.Ok(new StudioDto((await availability.GetAsync(ct)).Settings.LessonMinutes, o.Value.CancelHours, o.Value.MoveHours, o.Value.Packages, o.Value.Bank, teacher));
        });
        // avatars are public on purpose (students and the website show them); file names are random
        pub.MapGet("/avatars/{name}", (string name, IOptions<StudioOptions> o, IWebHostEnvironment env, HttpContext http) =>
        {
            var path = Path.Combine(env.ContentRootPath, o.Value.AvatarsFolder, Path.GetFileName(name));
            http.Response.Headers.CacheControl = "public, max-age=86400";
            var type = Path.GetExtension(path) switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
            return File.Exists(path) ? Results.File(path, type) : Results.NotFound();
        });

        pub.MapPost("/consults", async (ConsultRequest r, AppDbContext db, AlertService alerts, CancellationToken ct) =>
        {
            string[] contactTypes = ["line", "email"], times = ["weekdayDay", "weekdayEvening", "weekend", "any"];
            if (string.IsNullOrWhiteSpace(r.Name) || string.IsNullOrWhiteSpace(r.Contact))
                return Problems.Of(400, "validation", "請填寫名字和聯絡方式。");
            if (!contactTypes.Contains(r.ContactType) || !times.Contains(r.PreferredTime))
                return Problems.Of(400, "validation", "資料格式不正確。");
            var contact = r.Contact.Trim();
            if (r.ContactType == "email" && !Input.IsEmail(contact))
                return Problems.Of(400, "validation", "請填寫正確的 Email。");
            var name = r.Name.Trim();
            var topic = (r.Topic ?? "").Trim();
            var c = new Consult
            {
                Name = name[..Math.Min(80, name.Length)],
                ContactType = r.ContactType,
                Contact = contact[..Math.Min(120, contact.Length)],
                PreferredTime = r.PreferredTime,
                Topic = topic[..Math.Min(1000, topic.Length)],
            };
            db.Consults.Add(c);
            var when = EmailFormat.ConsultTime(c.PreferredTime);
            if (c.ContactType == "email")
                await alerts.EmailGuestAsync(c.Contact, c.Name, "consult-received", new() { ["preferredTime"] = when, ["topic"] = c.Topic }, $"consult:{c.Id}", ct);
            await alerts.EmailTeacherAsync("teacher-new-consult", new()
            {
                ["consultName"] = c.Name, ["contact"] = $"{(c.ContactType == "email" ? "Email" : "LINE")}：{c.Contact}", ["preferredTime"] = when, ["topic"] = c.Topic,
            }, $"teacher-consult:{c.Id}", ct);
            await db.SaveChangesAsync(ct); // one save: the consult and its emails commit together
            return Results.Created();
        }).RequireRateLimiting("consult");

        // One-click unsubscribe from marketing email (RFC 8058: mail apps POST here without a login).
        // Recorded as a new consent row, like any other withdrawal. Unknown or tampered links get the same answer.
        pub.MapPost("/unsubscribe", async (string? t, UnsubscribeLinks links, AppDbContext db, ConsentService consents, CancellationToken ct) =>
        {
            if (links.Read(t) is not { } id || !await db.Users.AnyAsync(u => u.Id == id, ct)) return Problems.Of(400, "invalid_link", "這個取消訂閱連結無效。");
            if ((await consents.LatestAsync(id, ConsentKind.Marketing, ct))?.Granted == true)
            {
                db.ConsentRecords.Add(new ConsentRecord { UserId = id, Kind = ConsentKind.Marketing, Granted = false, Version = "unsubscribe-link", Scope = "line,email", Source = ConsentSource.Request });
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        var auth = app.MapGroup("/api");

        auth.MapGet("/me", async (HttpContext http, AppDbContext db, JwtSession sessions, StudioClock clock, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (http.User.Identity?.IsAuthenticated != true) return Results.Text("null", "application/json");
            var id = http.User.UserId();
            var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (u is null || u.Declined) { sessions.SignOut(http); return Results.Text("null", "application/json"); }
            var today = clock.Today;
            var now = clock.NowTime;
            var booked = await db.Lessons.CountAsync(l => l.StudentId == id && l.Status == LessonStatus.Booked && (l.Date > today || (l.Date == today && l.Time > now)), ct);
            var attended = await db.Lessons.CountAsync(l => l.StudentId == id && l.Status == LessonStatus.Attended, ct);
            var unread = await db.Alerts.CountAsync(a => a.UserId == id && !a.Read && a.SendAfterUtc <= clock.UtcNow, ct);
            var trialAvailable = u.ClassType == LessonType.Trial
                && !await db.Payments.AnyAsync(p => p.StudentId == id && p.IsTrial && p.Status != PaymentStatus.Rejected, ct);
            return Results.Json<MeDto?>(new MeDto(u.Id, u.Name, u.Role.ToString(), u.Status.ToString(), u.Email, u.Phone, u.LineId, u.LineUserId != null,
                u.VoiceType, u.Goal, u.Grade, u.AvatarUrl, u.Credits, booked, attended, u.PackageSize, unread,
                u.ClassType.Camel(), trialAvailable, u.EmailVerified, u.EmailUpdates, u.EmailReminders));
        });

        auth.MapPut("/me/notifications", async (NotificationPrefsDto r, HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var id = http.User.UserId();
            await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.EmailUpdates, r.EmailUpdates).SetProperty(u => u.EmailReminders, r.EmailReminders), ct);
            return Results.Ok(r);
        }).RequireAuthorization();

        // Resend the verification link to the signed-in user's current email.
        auth.MapPost("/me/email/verification", async (HttpContext http, AppDbContext db, AccountTokens tokens, CancellationToken ct) =>
        {
            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            if (string.IsNullOrWhiteSpace(u.Email)) return Problems.Of(409, "no_email", "請先填寫 Email。");
            if (u.EmailVerified) return Problems.Of(409, "already_verified", "這個 Email 已經驗證過了。");
            if (!await tokens.SendVerificationAsync(u, ct)) return Problems.Of(429, "rate_limited", "驗證信剛寄出，請稍候 2 分鐘再試。");
            await db.SaveChangesAsync(ct);
            return Results.Accepted();
        }).RequireAuthorization().RequireRateLimiting("login");

        auth.MapPost("/auth/verify-email", async (TokenRequest r, AppDbContext db, AccountTokens tokens, CancellationToken ct) =>
        {
            if (await tokens.ConsumeAsync(r.Token, AuthTokenPurpose.VerifyEmail, ct) is not { } u)
                return Problems.Of(400, "invalid_token", "驗證連結已失效或已使用過，請重新寄送驗證信。");
            u.EmailVerified = true;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { email = u.Email });
        }).RequireRateLimiting("login");

        // Always the same answer, whether the email exists or not (no account discovery).
        // A verified contact address on a LINE-only account is not an email/password login.
        auth.MapPost("/auth/forgot-password", async (EmailOnlyRequest r, HttpContext http, AppDbContext db, AccountTokens tokens, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            if (!Input.IsEmail(email)) return Problems.Of(400, "validation", "請填寫正確的 Email。");
            await using var tx = await StudioTransaction.BeginAsync(db, ct);
            var u = await db.Users.FirstOrDefaultAsync(x => x.Email == email, ct);
            if (u is { Declined: false, PasswordHash: not null } && await tokens.SendResetAsync(u, ct))
                await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Accepted();
        }).RequireRateLimiting("password-recovery");

        // Checking a link never consumes it: mail scanners and opening the page cannot change a password.
        auth.MapPost("/auth/reset-password/validate", async (TokenRequest r, HttpContext http, AccountTokens tokens, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            return await tokens.ValidateResetAsync(r.Token, ct) is not null ? Results.NoContent()
                : Problems.Of(400, "invalid_token", "重設連結已失效或已使用過，請重新申請。");
        }).RequireRateLimiting("password-reset");

        auth.MapPost("/auth/reset-password", async (ResetPasswordRequest r, HttpContext http, AppDbContext db, AccountTokens tokens, JwtSession sessions, PasswordHasher<User> hasher, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if ((r.Password ?? "").Length is < 8 or > 128) return Problems.Of(400, "validation", "密碼請使用 8–128 個字元。");
            await using var tx = await StudioTransaction.BeginAsync(db, ct);
            if (await tokens.ConsumeAsync(r.Token, AuthTokenPurpose.ResetPassword, ct) is not { } u)
                return Problems.Of(400, "invalid_token", "重設連結已失效或已使用過，請重新申請。");
            u.PasswordHash = hasher.HashPassword(u, r.Password!);
            u.SessionVersion++;    // every existing session (other devices, a stolen cookie) stops working
            u.EmailVerified = true; // the link reached this inbox
            await tokens.RevokeAsync(u.Id, AuthTokenPurpose.ResetPassword, ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            sessions.SignOut(http);
            return Results.NoContent();
        }).RequireRateLimiting("password-reset");

        auth.MapPost("/auth/login", async (LoginRequest r, HttpContext http, AppDbContext db, JwtSession sessions, PasswordHasher<User> hasher, CancellationToken ct) =>
        {
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            var u = await db.Users.FirstOrDefaultAsync(x => x.Email == email, ct);
            // Same message for "no such email" and "wrong password": don't reveal which emails exist.
            var verified = u?.PasswordHash is null ? PasswordVerificationResult.Failed : hasher.VerifyHashedPassword(u, u.PasswordHash, r.Password ?? "");
            if (u is null || u.Declined || verified == PasswordVerificationResult.Failed)
                return Problems.Of(401, "bad_credentials", "Email 或密碼不正確。");
            if (verified == PasswordVerificationResult.SuccessRehashNeeded) { u.PasswordHash = hasher.HashPassword(u, r.Password!); await db.SaveChangesAsync(ct); }
            sessions.SignIn(http, u);
            return Results.Ok(new { u.Id, u.Name, Role = u.Role.ToString(), Status = u.Status.ToString() });
        }).RequireRateLimiting("login");

        // PRD AUTH-1: create an account. It starts as Pending; the student is signed in at once and sees /pending
        // until Iris approves (student endpoints check Status from the DB on every call).
        auth.MapPost("/auth/register", async (RegisterRequest r, HttpContext http, AppDbContext db, JwtSession sessions, PasswordHasher<User> hasher, ConsentService consents,
            AccountTokens tokens, AlertService alerts, StudioClock clock, CancellationToken ct) =>
        {
            if (await consents.ValidateAsync(null, r.Consents, ct) is { } bad) return Problems.Of(400, "consent_required", bad);
            var name = (r.Name ?? "").Trim();
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            if (name.Length is 0 or > 80 || !Input.IsEmail(email)) return Problems.Of(400, "validation", "請填寫姓名和正確的 Email。");
            if ((r.Password ?? "").Length is < 8 or > 128) return Problems.Of(400, "validation", "密碼至少 8 個字元。");
            if (await db.Users.AnyAsync(u => u.Email == email, ct)) return Problems.Of(409, "email_taken", "這個 Email 已經註冊過了，請直接登入。");
            var u = new User { Name = name, Email = email, Phone = string.IsNullOrWhiteSpace(r.Phone) ? null : r.Phone.Trim() };
            u.PasswordHash = hasher.HashPassword(u, r.Password!);
            db.Users.Add(u);
            await consents.RecordAsync(u.Id, r.Consents!, ct); // one SaveChanges = one transaction: no account without its consent record
            // ...and its emails: verify the address, "we got your application", and tell Iris
            await tokens.SendVerificationAsync(u, ct);
            await alerts.EmailAsync(u, "registration-pending", new() { ["email"] = email }, $"registered:{u.Id}", delay: false, ct: ct);
            await alerts.EmailTeacherAsync("teacher-new-registration", new()
            {
                ["studentName"] = u.Name, ["contact"] = $"Email：{email}", ["registeredAt"] = EmailFormat.Local(clock.LocalNow),
            }, $"teacher-registration:{u.Id}", ct);
            await db.SaveChangesAsync(ct);
            sessions.SignIn(http, u);
            return Results.Created("/api/me", new { u.Id, u.Name, Status = u.Status.ToString() });
        }).RequireRateLimiting("login");

        auth.MapPost("/auth/logout", (HttpContext http, JwtSession sessions) => { sessions.SignOut(http); return Results.NoContent(); });

        // LINE Login: a normal browser navigation (not fetch). The OIDC handler redirects to LINE and back to
        // /api/auth/line/callback; OnTicketReceived (Program.cs) persists the user and issues our application JWT.
        auth.MapGet("/auth/line", async (string? returnUrl, IAuthenticationSchemeProvider schemes) =>
        {
            if (await schemes.GetSchemeAsync("line") is null) return Problems.Of(503, "line_not_configured", "LINE 登入尚未設定（appsettings → Line:ChannelId）。");
            // only same-site relative paths: never redirect to another website after login (open redirect)
            var safe = Input.IsLocalUrl(returnUrl) ? returnUrl! : "/login";
            return Results.Challenge(new AuthenticationProperties { RedirectUri = safe }, ["line"]);
        });
    }
}
