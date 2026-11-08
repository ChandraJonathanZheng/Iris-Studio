using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

/// <summary>
/// 教師個人資料. Two kinds of data on purpose:
/// - public profile (name, avatar, contact LINE ID + whether students see it, status) → PUT /profile
/// - sign-in bindings (login email, LINE Login) → their own endpoints, and changing the email needs the password,
///   so someone at an unlocked phone can't take over the account by editing a text field.
/// </summary>
public static class TeacherProfileEndpoints
{
    public const int MaxAvatarBytes = 2 * 1024 * 1024;

    public static void MapTeacherProfile(this IEndpointRouteBuilder app)
    {
        var t = app.MapGroup("/api/teacher").RequireAuthorization("Teacher");

        t.MapGet("/profile", async (HttpContext http, AppDbContext db, CancellationToken ct) =>
            Dto(await db.Users.AsNoTracking().FirstAsync(u => u.Id == http.User.UserId(), ct)));

        t.MapPut("/profile", async (TeacherProfileRequest r, HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var name = (r.Name ?? "").Trim();
            if (name.Length is 0 or > 40) return Problems.Of(400, "validation", "請填寫教師名稱（最多 40 字）。");
            if (!Enum.TryParse<TeacherStatus>(r.Status, true, out var status)) return Problems.Of(400, "validation", "請選擇目前狀態。");
            var label = (r.StatusLabel ?? "").Trim();
            if (status == TeacherStatus.Custom && label.Length is 0 or > 12) return Problems.Of(400, "validation", "自訂狀態請填 1–12 個字。");
            var msg = (r.StatusMessage ?? "").Trim();
            if (msg.Length > 60) return Problems.Of(400, "validation", "狀態訊息最多 60 字。");
            var line = (r.LineId ?? "").Trim();
            if (line.Length > 30) return Problems.Of(400, "validation", "LINE ID 最多 30 字。");

            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            u.Name = name;
            u.LineId = line.Length == 0 ? null : line;
            u.LineIdPublic = r.LineIdPublic && u.LineId is not null; // can't show an empty ID
            u.TeacherStatus = status;
            u.StatusLabel = status == TeacherStatus.Custom ? label : null;
            u.StatusMessage = msg.Length == 0 ? null : msg;
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(u));
        });

        t.MapPost("/profile/avatar", async (HttpRequest req, HttpContext http, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
        {
            var form = await req.ReadFormAsync(ct);
            var file = form.Files["avatar"];
            if (file is null || file.Length == 0) return Problems.Of(400, "validation", "請選擇照片。");
            if (file.Length > MaxAvatarBytes) return Problems.Of(400, "too_large", "照片不能超過 2 MB。");
            await using var mem = new MemoryStream();
            await file.CopyToAsync(mem, ct);
            var type = await ImageService.DetectAsync(mem, ct); // checks the bytes, not the file name
            if (type is null) return Problems.Of(400, "bad_image", "只接受 JPG、PNG 或 WEBP 圖片。");
            var folder = Path.Combine(env.ContentRootPath, o.Value.AvatarsFolder);
            Directory.CreateDirectory(folder);
            var name = $"{Guid.NewGuid():N}{type switch { "image/png" => ".png", "image/webp" => ".webp", _ => ".jpg" }}";
            await File.WriteAllBytesAsync(Path.Combine(folder, name), mem.ToArray(), ct);

            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            var old = u.AvatarUrl;
            u.AvatarUrl = $"/api/public/avatars/{name}";
            await db.SaveChangesAsync(ct);
            if (old?.StartsWith("/api/public/avatars/") == true) // tidy up the previous file
                File.Delete(Path.Combine(folder, Path.GetFileName(old)));
            return Results.Ok(new { avatarUrl = u.AvatarUrl });
        }).DisableAntiforgery();

        t.MapDelete("/profile/avatar", async (HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            u.AvatarUrl = null;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Login email: needs the current password. EmailVerified goes back to false.
        // TODO: send the verification link once Resend is connected (see FLOW.md §6).
        t.MapPut("/account/email", async (ChangeEmailRequest r, HttpContext http, AppDbContext db, PasswordHasher<User> hasher, CancellationToken ct) =>
        {
            var email = (r.Email ?? "").Trim().ToLowerInvariant();
            if (!email.Contains('@') || email.Length > 200) return Problems.Of(400, "validation", "請填寫正確的 Email。");
            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            if (u.PasswordHash is null || hasher.VerifyHashedPassword(u, u.PasswordHash, r.Password ?? "") == PasswordVerificationResult.Failed)
                return Problems.Of(403, "wrong_password", "密碼不正確。");
            if (await db.Users.AnyAsync(x => x.Email == email && x.Id != u.Id, ct)) return Problems.Of(409, "email_taken", "這個 Email 已經被其他帳號使用。");
            if (u.Email != email) { u.Email = email; u.EmailVerified = false; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(u));
        });

        // Unlink LINE Login. Only when there is still another way in (email + password), or Iris would be locked out.
        // Linking happens through the LINE Login redirect (to add: /api/auth/line?link=1 attaches the sub to the signed-in user).
        t.MapDelete("/account/line", async (HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            if (u.PasswordHash is null || u.Email is null) return Problems.Of(409, "last_login_method", "這是你唯一的登入方式，請先設定 Email 和密碼。");
            u.LineUserId = null;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    static TeacherProfileDto Dto(User u) => new(u.Name, u.Email, u.EmailVerified, u.LineUserId != null, u.PasswordHash != null, u.LineId, u.LineIdPublic,
        u.AvatarUrl, u.TeacherStatus.Camel(), u.StatusLabel, u.StatusMessage);
}
