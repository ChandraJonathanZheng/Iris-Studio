using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

/// <summary>
/// 個人資料 photo + banner, uploaded by Iris for a student (teacher only).
///   POST /api/teacher/students/{id}/avatar   form "file" → { url }   (WebP, ≤ 512 px)
///   POST /api/teacher/students/{id}/cover    form "file" → { url }   (WebP, ≤ 1800 px)
/// Converted in memory (original never hits the disk, EXIF dropped); the previous file is deleted after the DB save.
/// Served by the existing public /api/public/avatars/{name} route (random file names).
/// </summary>
public static class StudentMediaEndpoints
{
    const long MaxBytes = 5 * 1024 * 1024;

    public static void MapStudentMedia(this IEndpointRouteBuilder app)
    {
        var t = app.MapGroup("/api/teacher/students").RequireAuthorization("Teacher");
        t.MapPost("/{id:guid}/avatar", (Guid id, HttpRequest req, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
            SaveAsync(id, req, db, o.Value, env, cover: false, ct)).DisableAntiforgery();
        t.MapPost("/{id:guid}/cover", (Guid id, HttpRequest req, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
            SaveAsync(id, req, db, o.Value, env, cover: true, ct)).DisableAntiforgery();
    }

    static async Task<IResult> SaveAsync(Guid id, HttpRequest req, AppDbContext db, StudioOptions o, IWebHostEnvironment env, bool cover, CancellationToken ct)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
        if (u is null) return Problems.Of(404, "not_found", "找不到這位學生。");
        if (!req.HasFormContentType) return Problems.Of(400, "validation", "請選擇圖片。");
        var file = (await req.ReadFormAsync(ct)).Files["file"];
        if (file is null || file.Length == 0) return Problems.Of(400, "validation", "請選擇圖片。");
        if (file.Length > MaxBytes) return Problems.Of(400, "too_large", "圖片不能超過 5 MB。");
        await using var mem = new MemoryStream();
        await file.CopyToAsync(mem, ct);
        if (await ImageService.DetectAsync(mem, ct) is null) return Problems.Of(400, "bad_image", "只接受 JPG、PNG 或 WEBP 圖片。");
        var (webp, _, _) = await ImageService.ToWebpAsync(mem, ct, maxSide: cover ? 1800 : 512);

        var folder = Path.Combine(env.ContentRootPath, o.AvatarsFolder);
        Directory.CreateDirectory(folder);
        var name = $"{(cover ? "cover" : "s")}_{Guid.NewGuid():N}.webp";
        var path = Path.Combine(folder, name);
        await File.WriteAllBytesAsync(path, webp, ct);

        var old = cover ? u.CoverUrl : u.AvatarUrl;
        var url = $"/api/public/avatars/{name}";
        if (cover) u.CoverUrl = url; else u.AvatarUrl = url;
        try { await db.SaveChangesAsync(ct); }
        catch { File.Delete(path); throw; }
        if (old?.StartsWith("/api/public/avatars/") == true) File.Delete(Path.Combine(folder, Path.GetFileName(old))); // free the old one
        return Results.Ok(new { url });
    }
}
