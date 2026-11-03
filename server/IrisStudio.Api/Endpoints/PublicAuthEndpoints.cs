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

        pub.MapGet("/studio", (IOptions<StudioOptions> o) =>
            TypedResults.Ok(new StudioDto(o.Value.Slots, o.Value.ClosedWeekdays, o.Value.CancelHours, o.Value.Packages, o.Value.Bank)));

        pub.MapPost("/consults", async (ConsultRequest r, AppDbContext db, StudioClock clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(r.Name) || string.IsNullOrWhiteSpace(r.Contact) || !DateOnly.TryParseExact(r.PreferredDate, "yyyy-MM-dd", out var d))
                return Problems.Of(400, "validation", "請填寫名字、聯絡方式和日期。");
            if (d < clock.Today) return Problems.Of(400, "validation", "日期不能早於今天。");
            db.Consults.Add(new Consult { Name = r.Name.Trim()[..Math.Min(80, r.Name.Trim().Length)], Contact = r.Contact.Trim(), PreferredDate = d, Topic = (r.Topic ?? "").Trim() });
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
            return Results.Json<MeDto?>(new MeDto(u.Id, u.Name, u.Role.ToString(), u.Status.ToString(), u.Email, u.Phone, u.LineId, u.LineUserId != null,
                u.VoiceType, u.Goal, u.Grade, u.AvatarUrl, u.Credits, booked, attended, u.PackageSize, unread));
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
