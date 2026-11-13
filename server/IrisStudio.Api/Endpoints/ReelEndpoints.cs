using System.Text.RegularExpressions;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

/// <summary>
/// 精彩片段 (Instagram Reels on the website).
/// Public:  GET /api/public/reels                 → live reels in order (max 8)
///          GET /api/public/reel-covers/{name}    → cover image
/// Teacher: GET/POST /api/teacher/reels, PUT/DELETE /api/teacher/reels/{id}, PUT /api/teacher/reels/order
/// Create/edit are multipart (title, url, optional cover). Delete is a soft delete.
/// </summary>
public static partial class ReelEndpoints
{
    public const int MaxReels = 8, MaxCoverBytes = 5 * 1024 * 1024, MaxTitle = 60;

    // https://www.instagram.com/reel/ABC123/ (also /p/ and /reels/), optional query/trailing slash; no CJK anywhere
    [GeneratedRegex(@"^https://(www\.)?instagram\.com/(reel|reels|p)/[A-Za-z0-9_-]+/?(\?[\x21-\x7E]*)?$")]
    private static partial Regex IgUrl();
    [GeneratedRegex(@"[　-〿㐀-鿿豈-﫿＀-￯]")]
    private static partial Regex Cjk();

    public record ReelDto(Guid Id, int SortOrder, string Title, string Url, string? CoverUrl, string? CoverLqip);
    public record OrderRequest(Guid[] Ids);

    static ReelDto Dto(InstagramReel r) => new(r.Id, r.SortOrder, r.Title, r.Url, r.CoverPath is null ? null : $"/api/public/reel-covers/{r.CoverPath}", r.CoverLqip);

    /// <summary>Returns a user-facing message when the URL is not an Instagram link we accept.</summary>
    public static string? UrlProblem(string? url)
    {
        url = (url ?? "").Trim();
        if (url.Length == 0) return "請填寫 Reels 連結。";
        if (Cjk().IsMatch(url)) return "連結不能有中文字。";
        if (!url.StartsWith("https://")) return "連結要用 https:// 開頭。";
        if (!IgUrl().IsMatch(url)) return "請貼上 Instagram Reels 的連結，例如 https://www.instagram.com/reel/ABC123/";
        return null;
    }

    public static void MapReels(this IEndpointRouteBuilder app)
    {
        var pub = app.MapGroup("/api/public");
        pub.MapGet("/reels", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok((await db.InstagramReels.AsNoTracking().OrderBy(r => r.SortOrder).Take(MaxReels).ToListAsync(ct)).Select(Dto)));
        pub.MapGet("/reel-covers/{name}", (string name, IOptions<StudioOptions> o, IWebHostEnvironment env, HttpContext http) =>
        {
            var path = Path.Combine(env.ContentRootPath, o.Value.ReelCoversFolder, Path.GetFileName(name));
            http.Response.Headers.CacheControl = "public, max-age=86400";
            var type = Path.GetExtension(path) switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
            return File.Exists(path) ? Results.File(path, type) : Results.NotFound();
        });

        var t = app.MapGroup("/api/teacher/reels").RequireAuthorization("Teacher");
        t.MapGet("", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok((await db.InstagramReels.AsNoTracking().OrderBy(r => r.SortOrder).ToListAsync(ct)).Select(Dto)));

        t.MapPost("", async (HttpRequest req, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
        {
            if (await db.InstagramReels.CountAsync(ct) >= MaxReels) return Problems.Of(409, "limit", $"最多 {MaxReels} 則 Reels，請先刪除一則。");
            var form = await req.ReadFormAsync(ct);
            if (Validate(form) is { } bad) return bad;
            var r = new InstagramReel { Title = form["title"].ToString().Trim(), Url = form["url"].ToString().Trim(),
                SortOrder = (await db.InstagramReels.MaxAsync(x => (int?)x.SortOrder, ct) ?? 0) + 1 };
            if (await SaveCoverAsync(form, r, o.Value, env, ct) is { } badImg) return badImg;
            db.InstagramReels.Add(r);
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(r));
        }).DisableAntiforgery();

        t.MapPut("/{id:guid}", async (Guid id, HttpRequest req, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
        {
            var r = await db.InstagramReels.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (r is null) return Problems.Of(404, "not_found", "找不到這則 Reels。");
            var form = await req.ReadFormAsync(ct);
            if (Validate(form) is { } bad) return bad;
            r.Title = form["title"].ToString().Trim();
            r.Url = form["url"].ToString().Trim();
            if (await SaveCoverAsync(form, r, o.Value, env, ct) is { } badImg) return badImg;
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(r));
        }).DisableAntiforgery();

        // soft delete, then close the gap in the numbering (1..n stays continuous)
        t.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var r = await db.InstagramReels.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (r is null) return Results.NoContent(); // already gone: deleting twice is not an error
            r.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            var live = await db.InstagramReels.OrderBy(x => x.SortOrder).ToListAsync(ct);
            for (var i = 0; i < live.Count; i++) live[i].SortOrder = i + 1;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // drag-to-sort: the client sends every live id in the new order
        t.MapPut("/order", async (OrderRequest body, AppDbContext db, CancellationToken ct) =>
        {
            var live = await db.InstagramReels.ToListAsync(ct);
            if (body.Ids is null || body.Ids.Length != live.Count || body.Ids.Distinct().Count() != live.Count || live.Any(r => !body.Ids.Contains(r.Id)))
                return Problems.Of(409, "stale", "列表已經變動，請重新整理後再排序。");
            for (var i = 0; i < body.Ids.Length; i++) live.First(r => r.Id == body.Ids[i]).SortOrder = i + 1;
            await db.SaveChangesAsync(ct);
            return Results.Ok(live.OrderBy(r => r.SortOrder).Select(Dto));
        });
    }

    static IResult? Validate(IFormCollection form)
    {
        var title = form["title"].ToString().Trim();
        if (title.Length == 0) return Problems.Of(400, "validation", "請填寫 IG 自訂標題。");
        if (title.Length > MaxTitle) return Problems.Of(400, "validation", $"標題最多 {MaxTitle} 個字。");
        return UrlProblem(form["url"]) is { } m ? Problems.Of(400, "validation", m) : null;
    }

    static async Task<IResult?> SaveCoverAsync(IFormCollection form, InstagramReel r, StudioOptions o, IWebHostEnvironment env, CancellationToken ct)
    {
        var file = form.Files["cover"];
        if (file is null || file.Length == 0) return null; // keep the current cover
        if (file.Length > MaxCoverBytes) return Problems.Of(400, "too_large", "封面圖不能超過 5 MB。");
        await using var mem = new MemoryStream();
        await file.CopyToAsync(mem, ct);
        var type = await ImageService.DetectAsync(mem, ct); // checks the bytes, not the file name
        if (type is null) return Problems.Of(400, "bad_image", "只接受 JPG、PNG 或 WEBP 圖片。");
        var folder = Path.Combine(env.ContentRootPath, o.ReelCoversFolder);
        Directory.CreateDirectory(folder);
        var name = $"{Guid.NewGuid():N}{type switch { "image/png" => ".png", "image/webp" => ".webp", _ => ".jpg" }}";
        await File.WriteAllBytesAsync(Path.Combine(folder, name), mem.ToArray(), ct);
        r.CoverLqip = await ImageService.MakeLqipAsync(mem, ct);
        if (r.CoverPath is not null) File.Delete(Path.Combine(folder, r.CoverPath));
        r.CoverPath = name;
        return null;
    }
}
