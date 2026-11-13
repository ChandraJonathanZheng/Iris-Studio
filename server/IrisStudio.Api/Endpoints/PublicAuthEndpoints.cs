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

        pub.MapGet("/studio", async (IOptions<StudioOptions> o, AvailabilityService availability, PackageService packages, AppDbContext db, CancellationToken ct) =>
        {
            var t = await db.Users.AsNoTracking().FirstAsync(u => u.Role == Role.Teacher, ct);
            var teacher = new TeacherPublicDto(t.Name, t.AvatarUrl, t.TeacherStatus.Camel(), t.StatusLabel, t.StatusMessage, t.LineIdPublic ? t.LineId : null);
            return TypedResults.Ok(new StudioDto((await availability.GetAsync(ct)).Settings.LessonMinutes, o.Value.CancelHours, o.Value.MoveHours, o.Value.ReportDays, o.Value.CancelFee, await packages.GetAsync(ct), o.Value.Bank, teacher));
        });
        // avatars are public on purpose (students and the website show them); file names are random
        pub.MapGet("/avatars/{name}", (string name, IOptions<StudioOptions> o, IWebHostEnvironment env, HttpContext http) =>
        {
            var path = Path.Combine(env.ContentRootPath, o.Value.AvatarsFolder, Path.GetFileName(name));
            http.Response.Headers.CacheControl = "public, max-age=86400";
            var type = Path.GetExtension(path) switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
            return File.Exists(path) ? Results.File(path, type) : Results.NotFound();
        });

        pub.MapPost("/consults", async (ConsultRequest r, AppDbContext db, CancellationToken ct) =>
        {
            string[] contactTypes = ["line", "email"], times = ["weekdayDay", "weekdayEvening", "weekend", "any"];
            if (string.IsNullOrWhiteSpace(r.Name) || string.IsNullOrWhiteSpace(r.Contact))
                return Problems.Of(400, "validation", "請填寫名字和聯絡方式。");
            if (!contactTypes.Contains(r.ContactType) || !times.Contains(r.PreferredTime))
                return Problems.Of(400, "validation", "資料格式不正確。");
            var contact = r.Contact.Trim();
            if (r.ContactType == "email" && !System.Net.Mail.MailAddress.TryCreate(contact, out _))
                return Problems.Of(400, "validation", "請填寫正確的 Email。");
            var name = r.Name.Trim();
            var topic = (r.Topic ?? "").Trim();
            db.Consults.Add(new Consult
            {
                Name = name[..Math.Min(80, name.Length)],
                ContactType = r.ContactType,
                Contact = contact[..Math.Min(120, contact.Length)],
                PreferredTime = r.PreferredTime,
                Topic = topic[..Math.Min(1000, topic.Length)],
            });
            await db.SaveChangesAsync(ct);
            return Results.Created();
        }).RequireRateLimiting("consult");

        var auth = app.MapGroup("/api");

        auth.MapGet("/me", async (HttpContext http, AppDbContext db, StudioClock clock, CancellationToken ct) =>
        {
            if (http.User.Identity?.IsAuthenticated != true) return Results.Json<MeDto?>(null);
            var id = http.User.UserId();
            var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (u is null || u.Declined) { await http.SignOutAsync(Claims.Scheme); return Results.Json<MeDto?>(null); }
            var booked = await db.Lessons.CountAsync(l => l.StudentId == id && l.Status == LessonStatus.Booked, ct);
            var attended = await db.Lessons.CountAsync(l => l.StudentId == id && l.Status == LessonStatus.Attended, ct);
            // 已取消 on the quota card: cancelled too late, so the credit was used (not refunded, not Iris's cancellation)
            var cancelled = await db.Lessons.CountAsync(l => l.StudentId == id && l.Status == LessonStatus.Cancelled && !l.Refunded && !l.CancelledByTeacher, ct);
            // 取消 on the quota card: a past class the student reported and Iris approved (credit was given back)
            var reported = await db.Lessons.CountAsync(l => l.StudentId == id && l.Status == LessonStatus.Cancelled && l.CancelledByReport, ct);
            var unread = await db.Alerts.CountAsync(a => a.UserId == id && !a.Read && a.SendAfterUtc <= clock.UtcNow, ct);
            // 單堂課: only after Iris marks the consultation/interview done, and only once
            var trialAvailable = u.ConsultationCompleted
                && !await db.Payments.AnyAsync(p => p.StudentId == id && p.IsTrial && p.Status != PaymentStatus.Rejected, ct);
            return Results.Json<MeDto?>(new MeDto(u.Id, u.Name, u.Role.ToString(), u.Status.ToString(), u.Email, u.Phone, u.LineId, u.LineUserId != null,
                u.VoiceType, u.Goal, u.Grade, u.AvatarUrl, u.Credits, booked, attended, u.PackageSize, unread,
                u.ClassType.Camel(), trialAvailable, cancelled, reported));
        });

        auth.MapPost("/auth/login", async (LoginRequest r, HttpContext http, AppDbContext db, PasswordHasher<User> hasher, CancellationToken ct) =>
        {
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            var u = await db.Users.FirstOrDefaultAsync(x => x.Email == email, ct);
            // Same message for "no such email" and "wrong password": don't reveal which emails exist.
            if (u?.PasswordHash is null || u.Declined || hasher.VerifyHashedPassword(u, u.PasswordHash, r.Password ?? "") == PasswordVerificationResult.Failed)
                return Problems.Of(401, "bad_credentials", "Email 或密碼不正確。");
            await http.SignInAsync(Claims.Scheme, Claims.For(u));
            return Results.Ok(new { u.Id, u.Name, Role = u.Role.ToString(), Status = u.Status.ToString() });
        }).RequireRateLimiting("login");

        // PRD AUTH-1: create an account. It starts as Pending; the student is signed in at once and sees /pending
        // until Iris approves (student endpoints check Status from the DB on every call).
        auth.MapPost("/auth/register", async (RegisterRequest r, HttpContext http, AppDbContext db, PasswordService passwords, ConsentService consents, CancellationToken ct) =>
        {
            if (await consents.ValidateAsync(null, r.Consents, ct) is { } bad) return Problems.Of(400, "consent_required", bad);
            var name = (r.Name ?? "").Trim();
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            if (name.Length is 0 or > 80 || !System.Net.Mail.MailAddress.TryCreate(email, out _)) return Problems.Of(400, "validation", "請填寫姓名和正確的 Email。");
            // same rule as the sign-up form: ≥ 8 characters with an upper-case letter, a lower-case letter and a number
            if (PasswordService.RuleProblem(r.Password) is { } weak) return Problems.Of(400, "validation", weak);
            if (await db.Users.AnyAsync(u => u.Email == email, ct)) return Problems.Of(409, "email_taken", "這個 Email 已經註冊過了，請直接登入。");
            var u = new User { Name = name, Email = email, Phone = string.IsNullOrWhiteSpace(r.Phone) ? null : r.Phone.Trim() };
            db.Users.Add(u);
            await passwords.SetPasswordAsync(u, r.Password!, ct); // also starts the password history
            await consents.RecordAsync(u.Id, r.Consents!, ct); // one SaveChanges = one transaction: no account without its consent record
            await db.SaveChangesAsync(ct);
            await http.SignInAsync(Claims.Scheme, Claims.For(u));
            return Results.Created("/api/me", new { u.Id, u.Name, Status = u.Status.ToString() });
        }).RequireRateLimiting("login");

        // 忘記密碼: always the same answer, so nobody can find out which emails have an account here
        auth.MapPost("/auth/forgot-password", async (ForgotPasswordRequest r, PasswordService passwords, CancellationToken ct) =>
        {
            await passwords.RequestResetAsync(r.Email, ct);
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("login");
        // the reset page asks first, so an old link shows "已失效" right away instead of after typing a password
        auth.MapPost("/auth/reset-password/check", async (ResetCheckRequest r, PasswordService passwords, CancellationToken ct) =>
            Results.Ok(new { valid = await passwords.IsValidAsync(r.Token, ct) })).RequireRateLimiting("login");
        auth.MapPost("/auth/reset-password", async (ResetPasswordRequest r, PasswordService passwords, CancellationToken ct) =>
        {
            await passwords.ResetAsync(r.Token, r.Password, ct);
            return Results.NoContent();
        }).RequireRateLimiting("login");

        auth.MapPost("/auth/logout", async (HttpContext http) => { await http.SignOutAsync(Claims.Scheme); return Results.NoContent(); });

        // LINE Login: a normal browser navigation (not fetch). The OIDC handler redirects to LINE and back to
        // /api/auth/line/callback; OnTicketReceived (Program.cs) finds or creates the user and issues our cookie.
        auth.MapGet("/auth/line", async (string? returnUrl, IAuthenticationSchemeProvider schemes) =>
        {
            if (await schemes.GetSchemeAsync("line") is null) return Problems.Of(503, "line_not_configured", "LINE 登入尚未設定（appsettings → Line:ChannelId）。");
            // only same-site relative paths: never redirect to another website after login (open redirect)
            var safe = !string.IsNullOrEmpty(returnUrl) && returnUrl.StartsWith('/') && !returnUrl.StartsWith("//") ? returnUrl : "/login";
            return Results.Challenge(new AuthenticationProperties { RedirectUri = safe }, ["line"]);
        });
    }
}
