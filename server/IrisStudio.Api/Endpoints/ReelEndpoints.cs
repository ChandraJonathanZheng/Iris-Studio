using System.Text.RegularExpressions;
using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

/// <summary>
/// 精彩片段: the Instagram Reels row on the website. Iris manages it from 更多 → 網站精彩片段.
///
/// Rules (all checked here, the client only repeats them for quick feedback):
/// - at most <see cref="MaxReels"/> visible reels
/// - link must be an Instagram Reel / post link; it is stored in one clean form
/// - thumbnail: real JPG / PNG / WEBP (checked by its bytes), 5 MB max
/// - delete is a soft delete (復原 = restore), order is saved as a whole list
/// </summary>
public static partial class ReelEndpoints
{
    public const int MaxReels = 8;
    public const long MaxThumbnailBytes = ImageService.MaxBytes; // 5 MB, same limit as receipts

    // instagram.com/reel/CODE, /reels/CODE, /p/CODE and the newer /username/reel/CODE; with or without www., m., query string.
    // The timeout stops a crafted, very long input from making the regex run for a long time (ReDoS).
    [GeneratedRegex(@"^https?://(?:www\.|m\.)?instagram\.com/(?:[A-Za-z0-9._]{1,30}/)?(?:reels?|p)/([A-Za-z0-9_-]{5,40})/?(?:[?#].*)?$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    private static partial Regex LinkPattern();

    /// <summary>The Reel id from a pasted link, or null when it isn't an Instagram Reel/post link.</summary>
    public static string? ParseShortcode(string? url)
    {
        var text = (url ?? "").Trim();
        if (text.Length is 0 or > 300) return null;
        var m = LinkPattern().Match(text);
        return m.Success ? m.Groups[1].Value : null; // the id is case-sensitive, so it's kept exactly as pasted
    }

    public static string CanonicalUrl(string shortcode) => $"https://www.instagram.com/reel/{shortcode}/";

    public static void MapReels(this IEndpointRouteBuilder app)
    {
        // ---------- public: what the website shows ----------
        var pub = app.MapGroup("/api/public/reels");

        pub.MapGet("", async (AppDbContext db, CancellationToken ct) =>
            TypedResults.Ok((await Ordered(db).AsNoTracking().ToListAsync(ct))
                .Select(r => new PublicReelDto(r.Id, r.Url, ThumbUrl(r), r.Lqip)).ToArray()));

        // Thumbnails are public on purpose (the website shows them). Names are random and never reused → cache for a year.
        pub.MapGet("/thumbs/{name}", (string name, IOptions<StudioOptions> o, IWebHostEnvironment env, HttpContext http) =>
        {
            var path = Path.Combine(env.ContentRootPath, o.Value.ReelsFolder, Path.GetFileName(name)); // GetFileName blocks "../"
            if (!File.Exists(path)) return Results.NotFound();
            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            var type = Path.GetExtension(path) switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
            return Results.File(path, type);
        });

        // ---------- teacher: manage the list ----------
        var t = app.MapGroup("/api/teacher/reels").RequireAuthorization("Teacher");

        t.MapGet("", async (AppDbContext db, CancellationToken ct) =>
            TypedResults.Ok((await Ordered(db).AsNoTracking().ToListAsync(ct)).Select(Dto).ToArray()));

        // Add: multipart form { url, thumbnail }
        t.MapPost("", async (HttpRequest req, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, StudioClock clock, CancellationToken ct) =>
        {
            var form = await req.ReadFormAsync(ct);
            var code = ParseShortcode(form["url"]);
            if (code is null) return BadLink();
            var file = form.Files["thumbnail"];
            if (file is null || file.Length == 0) return Problems.Of(400, "validation", "請選擇封面圖片。");
            var image = await ReadThumbnailAsync(file, ct);

            // One writer at a time: two quick "新增" taps can't both pass the 8-reel check.
            await using var tx = await StudioTransaction.BeginAsync(db, ct);
            if (await db.InstagramReels.CountAsync(ct) >= MaxReels) return LimitReached();
            if (await db.InstagramReels.AnyAsync(r => r.Shortcode == code, ct)) return Duplicate();

            var folder = Folder(o, env);
            var name = await SaveFileAsync(folder, image, ct);
            try
            {
                var next = (await db.InstagramReels.MaxAsync(r => (int?)r.SortOrder, ct) ?? 0) + 1; // new reel goes last
                var reel = new InstagramReel
                {
                    Url = CanonicalUrl(code), Shortcode = code, ThumbnailFile = name, ThumbnailType = image.Type, Lqip = image.Lqip,
                    SortOrder = next, CreatedAtUtc = clock.UtcNow, UpdatedAtUtc = clock.UtcNow,
                };
                db.InstagramReels.Add(reel);
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return Results.Created($"/api/teacher/reels/{reel.Id}", Dto(reel));
            }
            catch
            {
                File.Delete(Path.Combine(folder, name)); // the row wasn't saved → don't leave an orphan file
                throw;
            }
        }).DisableAntiforgery();

        // Edit: multipart form { url, thumbnail? } — no thumbnail = keep the current one
        t.MapPut("/{id:guid}", async (Guid id, HttpRequest req, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, StudioClock clock, CancellationToken ct) =>
        {
            var form = await req.ReadFormAsync(ct);
            var code = ParseShortcode(form["url"]);
            if (code is null) return BadLink();
            var file = form.Files["thumbnail"];
            var image = file is { Length: > 0 } ? await ReadThumbnailAsync(file, ct) : null;

            await using var tx = await StudioTransaction.BeginAsync(db, ct);
            var reel = await db.InstagramReels.FirstOrDefaultAsync(r => r.Id == id, ct);
            if (reel is null) return NotFound();
            if (await db.InstagramReels.AnyAsync(r => r.Shortcode == code && r.Id != id, ct)) return Duplicate();

            var folder = Folder(o, env);
            string? oldFile = null;
            if (image is not null)
            {
                oldFile = reel.ThumbnailFile;
                reel.ThumbnailFile = await SaveFileAsync(folder, image, ct);
                reel.ThumbnailType = image.Type;
                reel.Lqip = image.Lqip;
            }
            reel.Url = CanonicalUrl(code);
            reel.Shortcode = code;
            reel.UpdatedAtUtc = clock.UtcNow;
            try
            {
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            }
            catch
            {
                if (oldFile is not null) File.Delete(Path.Combine(folder, reel.ThumbnailFile)); // new file is unused
                throw;
            }
            if (oldFile is not null) File.Delete(Path.Combine(folder, oldFile)); // only after the DB points at the new one
            return Results.Ok(Dto(reel));
        }).DisableAntiforgery();

        // Soft delete. Deleting twice is fine (still 204) — a double tap shouldn't show an error.
        t.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, StudioClock clock, CancellationToken ct) =>
        {
            var reel = await db.InstagramReels.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id, ct);
            if (reel is null) return NotFound();
            reel.DeletedAtUtc ??= clock.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // 復原 after delete. It goes back to its old place in the order (its SortOrder was never changed).
        t.MapPost("/{id:guid}/restore", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            await using var tx = await StudioTransaction.BeginAsync(db, ct);
            var reel = await db.InstagramReels.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id, ct);
            if (reel is null) return NotFound();
            if (reel.DeletedAtUtc is null) return Results.Ok(Dto(reel)); // already visible
            // Iris may have added another reel (or the same link again) after deleting this one.
            if (await db.InstagramReels.CountAsync(ct) >= MaxReels) return LimitReached();
            if (await db.InstagramReels.AnyAsync(r => r.Shortcode == reel.Shortcode, ct)) return Duplicate();
            reel.DeletedAtUtc = null;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(Dto(reel));
        });

        // Reorder: the client sends EVERY visible id in the new order. If the list changed meanwhile
        // (another tab added/deleted one), the sets don't match → 409, instead of silently saving a half order.
        t.MapPut("/order", async (ReelOrderRequest r, AppDbContext db, CancellationToken ct) =>
        {
            var ids = r.Ids ?? [];
            await using var tx = await StudioTransaction.BeginAsync(db, ct);
            var reels = await db.InstagramReels.ToListAsync(ct);
            if (ids.Length != reels.Count || ids.Distinct().Count() != ids.Length || !reels.All(x => ids.Contains(x.Id)))
                return Problems.Of(409, "order_stale", "列表剛剛有變動，請重新整理後再排序。");
            for (var i = 0; i < ids.Length; i++) reels.Single(x => x.Id == ids[i]).SortOrder = i + 1;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(reels.OrderBy(x => x.SortOrder).Select(Dto).ToArray());
        });
    }

    // ---------- helpers ----------
    private static IQueryable<InstagramReel> Ordered(AppDbContext db) =>
        db.InstagramReels.OrderBy(r => r.SortOrder).ThenBy(r => r.CreatedAtUtc);

    private static string ThumbUrl(InstagramReel r) => $"/api/public/reels/thumbs/{r.ThumbnailFile}";

    private static ReelDto Dto(InstagramReel r) =>
        new(r.Id, r.Url, r.Shortcode, ThumbUrl(r), r.Lqip, r.SortOrder, DateTime.SpecifyKind(r.UpdatedAtUtc, DateTimeKind.Utc));

    private static string Folder(IOptions<StudioOptions> o, IWebHostEnvironment env) =>
        Path.Combine(env.ContentRootPath, o.Value.ReelsFolder);

    private sealed record Thumbnail(byte[] Bytes, string Type, string Lqip);

    /// <summary>Size first (cheap), then the real format from the bytes, then decode for the blurred preview (also rejects broken files).</summary>
    private static async Task<Thumbnail> ReadThumbnailAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length > MaxThumbnailBytes) throw new BizException(400, "too_large", "封面圖片不能超過 5 MB。");
        await using var mem = new MemoryStream();
        await file.CopyToAsync(mem, ct);
        var type = await ImageService.DetectAsync(mem, ct)
            ?? throw new BizException(400, "bad_image", "封面只接受 JPG、PNG 或 WEBP 圖片。");
        var lqip = await ImageService.MakeLqipAsync(mem, ct);
        return new Thumbnail(mem.ToArray(), type, lqip);
    }

    private static async Task<string> SaveFileAsync(string folder, Thumbnail image, CancellationToken ct)
    {
        Directory.CreateDirectory(folder);
        var name = $"{Guid.NewGuid():N}{image.Type switch { "image/png" => ".png", "image/webp" => ".webp", _ => ".jpg" }}";
        await File.WriteAllBytesAsync(Path.Combine(folder, name), image.Bytes, ct);
        return name;
    }

    private static IResult BadLink() =>
        Problems.Of(400, "bad_link", "請貼上 Instagram Reels 連結，例如 https://www.instagram.com/reel/ABC123xyz/");
    private static IResult LimitReached() =>
        Problems.Of(409, "limit", $"最多只能放 {MaxReels} 支 Reels，請先刪除一支。");
    private static IResult Duplicate() =>
        Problems.Of(409, "duplicate", "這支 Reels 已經在列表裡了。");
    private static IResult NotFound() =>
        Problems.Of(404, "not_found", "找不到這支 Reels，可能已被刪除。");
}
