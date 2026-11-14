using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

/// <summary>
/// 課堂筆記 (teacher only). One note per lesson: rich text OR one screenshot.
///   GET    /api/teacher/lessons/{id}/note           → the note, or 404 no_note
///   PUT    /api/teacher/lessons/{id}/note           → multipart: kind=text&html=… | kind=image&file=… · replaces the old note
///   GET    /api/teacher/lesson-notes/files/{name}   → the WebP
/// There is no DELETE on purpose: in the modal 刪除 only clears the preview; the old note stays on the server until
/// Iris saves a new one, so closing the modal halfway never loses her note.
/// </summary>
public static class LessonNoteEndpoints
{
    const int MaxHtml = 5000;

    public static void MapLessonNotes(this IEndpointRouteBuilder app)
    {
        var t = app.MapGroup("/api/teacher").RequireAuthorization("Teacher");

        t.MapGet("/lessons/{id:guid}/note", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var n = await db.LessonNotes.AsNoTracking().FirstOrDefaultAsync(x => x.LessonId == id, ct);
            return n is null ? Problems.Of(404, "no_note", "這堂課還沒有筆記。") : Results.Ok(Dto(n));
        });

        t.MapPut("/lessons/{id:guid}/note", async (Guid id, HttpRequest req, HttpContext http, AppDbContext db, StudioClock clock,
            IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
        {
            if (!req.HasFormContentType) return Problems.Of(400, "validation", "請用表單上傳。");
            var form = await req.ReadFormAsync(ct);
            var l = await db.Lessons.Include(x => x.Student).FirstOrDefaultAsync(x => x.Id == id, ct);
            if (l is null) return Problems.Of(404, "not_found", "找不到這堂課。");
            if (l.Status == LessonStatus.Cancelled) return Problems.Of(409, "cancelled", "這堂課已取消，不能加筆記。");
            if (!clock.IsPast(l.Date, l.Time)) return Problems.Of(409, "not_started", "課程開始後才能加筆記。");

            var note = await db.LessonNotes.FirstOrDefaultAsync(x => x.LessonId == id, ct);
            var oldFile = note?.FileName;
            note ??= db.LessonNotes.Add(new LessonNote { LessonId = l.Id, StudentId = l.StudentId }).Entity;
            note.ByUserId = http.User.UserId();
            note.UpdatedAtUtc = clock.UtcNow;

            var folder = Path.Combine(env.ContentRootPath, o.Value.LessonNotesFolder);
            string? tmp = null, final = null;
            var kind = form["kind"].ToString();
            if (kind == "text")
            {
                var html = NoteHtml.Clean(form["html"].ToString());
                if (NoteHtml.PlainText(html).Length == 0) return Problems.Of(400, "validation", "請輸入筆記內容。");
                if (html.Length > MaxHtml) return Problems.Of(400, "too_long", "筆記太長了，請精簡一點。");
                note.Kind = LessonNoteKind.Text; note.Html = html;
                note.FileName = null; note.Lqip = null; note.Width = null; note.Height = null;
            }
            else if (kind == "image")
            {
                var file = form.Files["file"];
                if (file is null || file.Length == 0) return Problems.Of(400, "validation", "請選擇一張截圖。");
                if (file.Length > ImageService.MaxBytes) return Problems.Of(400, "too_large", "圖片不能超過 5 MB。");
                await using var mem = new MemoryStream();
                await file.CopyToAsync(mem, ct); // in memory only — the original upload never touches the disk
                if (await ImageService.DetectAsync(mem, ct) is null) return Problems.Of(400, "bad_image", "只接受 JPG、PNG 或 WEBP 圖片。");
                var (webp, w, h) = await ImageService.ToWebpAsync(mem, ct);

                final = await FileNameAsync(db, l, folder, ct);
                Directory.CreateDirectory(folder);
                tmp = Path.Combine(folder, $"{Guid.NewGuid():N}.tmp");
                await File.WriteAllBytesAsync(tmp, webp, ct);
                note.Kind = LessonNoteKind.Image; note.Html = null;
                note.FileName = final; note.Lqip = await ImageService.MakeLqipAsync(new MemoryStream(webp), ct); note.Width = w; note.Height = h;
            }
            else return Problems.Of(400, "validation", "請選擇筆記類型。");

            // DB first, files after: if the save fails, the old note and its file are untouched and the temp file goes away
            try { await db.SaveChangesAsync(ct); }
            catch { if (tmp is not null) File.Delete(tmp); throw; }
            if (tmp is not null && final is not null) File.Move(tmp, Path.Combine(folder, final), overwrite: true);
            if (oldFile is not null && oldFile != final) File.Delete(Path.Combine(folder, oldFile)); // replaced → free the storage
            return Results.Ok(Dto(note));
        });

        t.MapGet("/lesson-notes/files/{name}", async (string name, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, HttpContext http, CancellationToken ct) =>
        {
            var safe = Path.GetFileName(name); // no ../ tricks
            if (!await db.LessonNotes.AnyAsync(n => n.FileName == safe, ct)) return Results.NotFound();
            var path = Path.Combine(env.ContentRootPath, o.Value.LessonNotesFolder, safe);
            http.Response.Headers.CacheControl = "private, max-age=3600";
            return File.Exists(path) ? Results.File(path, "image/webp") : Results.NotFound();
        });
    }

    /// <summary>
    /// {yyyyMMdd}_{學生姓名}_Class_Notes.webp. If the same student has two lessons that day, the second one gets its
    /// start time added (…_Class_Notes_1630.webp), so one lesson's screenshot can never overwrite another's.
    /// </summary>
    static async Task<string> FileNameAsync(AppDbContext db, Lesson l, string folder, CancellationToken ct)
    {
        var bad = Path.GetInvalidFileNameChars();
        var who = new string((l.Student?.Name ?? "student").Select(c => bad.Contains(c) || char.IsWhiteSpace(c) ? '_' : c).ToArray());
        var name = $"{l.Date:yyyyMMdd}_{who}_Class_Notes.webp";
        var owner = await db.LessonNotes.AsNoTracking().Where(n => n.FileName == name).Select(n => (Guid?)n.LessonId).FirstOrDefaultAsync(ct);
        return owner is null || owner == l.Id ? name : $"{l.Date:yyyyMMdd}_{who}_Class_Notes_{l.Time:HHmm}.webp";
    }

    static LessonNoteDto Dto(LessonNote n) => new(n.LessonId, n.StudentId, n.Kind == LessonNoteKind.Text ? "text" : "image", n.Html,
        n.FileName is null ? null : $"/api/teacher/lesson-notes/files/{Uri.EscapeDataString(n.FileName)}?v={n.UpdatedAtUtc.Ticks}",
        n.FileName, n.Lqip, n.Width, n.Height, DateTime.SpecifyKind(n.UpdatedAtUtc, DateTimeKind.Utc));
}
