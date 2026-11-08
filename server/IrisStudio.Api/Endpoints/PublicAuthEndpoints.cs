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

        pub.MapGet("/studio", async (IOptions<StudioOptions> o, AvailabilityService availability, CancellationToken ct) =>
            TypedResults.Ok(new StudioDto((await availability.GetAsync(ct)).Settings.LessonMinutes, o.Value.CancelHours, o.Value.MoveHours, o.Value.Packages, o.Value.Bank)));

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
            var unread = await db.Alerts.CountAsync(a => a.UserId == id && !a.Read && a.SendAfterUtc <= clock.UtcNow, ct);
            var trialAvailable = u.ClassType == LessonType.Trial
                && !await db.Payments.AnyAsync(p => p.StudentId == id && p.IsTrial && p.Status != PaymentStatus.Rejected, ct);
            return Results.Json<MeDto?>(new MeDto(u.Id, u.Name, u.Role.ToString(), u.Status.ToString(), u.Email, u.Phone, u.LineId, u.LineUserId != null,
                u.VoiceType, u.Goal, u.Grade, u.AvatarUrl, u.Credits, booked, attended, u.PackageSize, unread,
                u.ClassType.Camel(), trialAvailable));
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
        auth.MapPost("/auth/register", async (RegisterRequest r, HttpContext http, AppDbContext db, PasswordHasher<User> hasher, CancellationToken ct) =>
        {
            var name = (r.Name ?? "").Trim();
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            if (name.Length is 0 or > 80 || !System.Net.Mail.MailAddress.TryCreate(email, out _)) return Problems.Of(400, "validation", "請填寫姓名和正確的 Email。");
            if ((r.Password ?? "").Length < 8) return Problems.Of(400, "validation", "密碼至少 8 個字元。");
            if (await db.Users.AnyAsync(u => u.Email == email, ct)) return Problems.Of(409, "email_taken", "這個 Email 已經註冊過了，請直接登入。");
            var u = new User { Name = name, Email = email, Phone = string.IsNullOrWhiteSpace(r.Phone) ? null : r.Phone.Trim() };
            u.PasswordHash = hasher.HashPassword(u, r.Password!);
            db.Users.Add(u);
            await db.SaveChangesAsync(ct);
            await http.SignInAsync(Claims.Scheme, Claims.For(u));
            return Results.Created("/api/me", new { u.Id, u.Name, Status = u.Status.ToString() });
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
