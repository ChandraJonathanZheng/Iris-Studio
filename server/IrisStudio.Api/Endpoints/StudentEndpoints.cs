using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

public static class StudentEndpoints
{
    public static void MapSlotsAndStudent(this IEndpointRouteBuilder app)
    {
        // ---------- slots (any signed-in user) ----------
        var slots = app.MapGroup("/api/slots").RequireAuthorization();

        slots.MapGet("/days", async (string from, int? count, AppDbContext db, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var start)) return Problems.Of(400, "validation", "日期格式不正確。");
            var n = Math.Clamp(count ?? 15, 1, 62);
            var end = start.AddDays(n - 1);
            var taken = await db.Lessons.Where(l => l.Status == LessonStatus.Booked && l.Date >= start && l.Date <= end)
                .Select(l => new { l.Date, l.Time }).ToListAsync(ct);
            var times = o.Value.SlotTimes;
            var days = Enumerable.Range(0, n).Select(i =>
            {
                var d = start.AddDays(i);
                if (d < clock.Today) return new DayDto(Map.D(d), "past");
                if (o.Value.ClosedWeekdays.Contains((int)d.DayOfWeek)) return new DayDto(Map.D(d), "closed");
                var open = times.Where(t => !clock.IsPast(d, t)).ToArray();
                if (open.Length == 0) return new DayDto(Map.D(d), "past");
                return new DayDto(Map.D(d), open.All(t => taken.Any(x => x.Date == d && x.Time == t)) ? "full" : "open");
            }).ToArray();
            return TypedResults.Ok(days);
        });

        // Students only see free/taken, never who booked (PRD §9 Q6).
        slots.MapGet("", async (string date, AppDbContext db, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d)) return Problems.Of(400, "validation", "日期格式不正確。");
            if (o.Value.ClosedWeekdays.Contains((int)d.DayOfWeek)) return TypedResults.Ok(Array.Empty<SlotDto>());
            var taken = await db.Lessons.Where(l => l.Status == LessonStatus.Booked && l.Date == d).Select(l => l.Time).ToListAsync(ct);
            return TypedResults.Ok(o.Value.SlotTimes.Select(t => new SlotDto(Map.T(t), clock.IsPast(d, t) ? "past" : taken.Contains(t) ? "full" : "free")).ToArray());
        });

        // ---------- student ----------
        var s = app.MapGroup("/api/student").RequireAuthorization("Student").AddEndpointFilter<ActiveStudentFilter>();

        s.MapGet("/lessons", async (string from, string to, HttpContext http, AppDbContext db, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            var id = http.User.UserId();
            if (!DateOnly.TryParse(from, out var f) || !DateOnly.TryParse(to, out var t)) return Problems.Of(400, "validation", "日期格式不正確。");
            var lessons = await db.Lessons.AsNoTracking().Include(l => l.Student).Where(l => l.StudentId == id && l.Date >= f && l.Date <= t)
                .OrderBy(l => l.Date).ThenBy(l => l.Time).ToListAsync(ct);
            var ids = lessons.Select(l => l.Id).ToList();
            var open = await db.ChangeRequests.AsNoTracking().Where(c => ids.Contains(c.LessonId) && c.Status == ChangeStatus.Open).ToListAsync(ct);
            return TypedResults.Ok(lessons.Select(l => Map.Lesson(l, o.Value.Room, open.FirstOrDefault(c => c.LessonId == l.Id))).ToArray());
        });

        s.MapPost("/lessons", async (BookRequest r, HttpContext http, BookingService booking, AppDbContext db, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            if (!Map.TryParseSlot(r.Date, r.Time, out var d, out var t)) return Problems.Of(400, "validation", "日期或時間格式不正確。");
            var id = http.User.UserId();
            var lesson = await booking.BookAsync(id, d, t, byTeacher: false, ct);
            var left = await db.Users.Where(u => u.Id == id).Select(u => u.Credits).FirstAsync(ct);
            lesson.Student = await db.Users.FirstAsync(u => u.Id == id, ct);
            return Results.Created($"/api/student/lessons/{lesson.Id}", new BookResultDto(Map.Lesson(lesson, o.Value.Room, null), left));
        }).AddEndpointFilter<IdempotencyFilter>();

        s.MapPost("/lessons/{id:guid}/cancel", async (Guid id, HttpContext http, BookingService booking, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            var (refunded, left) = await booking.CancelAsync(id, http.User.UserId(), ct);
            return TypedResults.Ok(new CancelResultDto(refunded, left, clock.UtcNow.Add(o.Value.UndoWindow)));
        });

        s.MapPost("/lessons/{id:guid}/undo-cancel", async (Guid id, HttpContext http, BookingService booking, CancellationToken ct) =>
        {
            await booking.UndoCancelAsync(id, http.User.UserId(), ct);
            return Results.NoContent();
        });

        s.MapPost("/lessons/{id:guid}/change-requests", async (Guid id, MoveRequest r, HttpContext http, BookingService booking, CancellationToken ct) =>
        {
            if (!Map.TryParseSlot(r.Date, r.Time, out var d, out var t)) return Problems.Of(400, "validation", "日期或時間格式不正確。");
            var c = await booking.AskMoveAsync(http.User.UserId(), id, d, t, r.Reason, ct);
            return Results.Created($"/api/student/change-requests/{c.Id}", new { c.Id });
        });

        s.MapPost("/change-requests/{id:guid}/withdraw", async (Guid id, HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var me = http.User.UserId();
            var n = await db.ChangeRequests.Where(c => c.Id == id && c.Status == ChangeStatus.Open && c.Lesson.StudentId == me)
                .ExecuteUpdateAsync(x => x.SetProperty(c => c.Status, ChangeStatus.Withdrawn), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到申請。") : Results.NoContent();
        });

        s.MapGet("/alerts", async (HttpContext http, AlertService alerts, CancellationToken ct) =>
            TypedResults.Ok((await alerts.Visible(http.User.UserId()).AsNoTracking().OrderByDescending(a => a.CreatedAtUtc).Take(100).ToListAsync(ct)).Select(Map.Alert).ToArray()));

        s.MapPost("/alerts/read", async (ReadRequest r, HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var me = http.User.UserId();
            await db.Alerts.Where(a => a.UserId == me && r.Ids.Contains(a.Id)).ExecuteUpdateAsync(x => x.SetProperty(a => a.Read, r.Read), ct);
            return Results.NoContent();
        });

        s.MapPut("/profile", async (ProfileRequest r, HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            // Only safe fields. Credits, status, grade and role can never be set here (mass assignment).
            var u = await db.Users.FirstAsync(x => x.Id == http.User.UserId(), ct);
            if (r.Name is { } n) { if (string.IsNullOrWhiteSpace(n)) return Problems.Of(400, "validation", "姓名不能是空的。"); u.Name = n.Trim(); }
            if (r.Email is not null)
            {
                var e = r.Email.Trim().ToLowerInvariant();
                if (e.Length > 0 && await db.Users.AnyAsync(x => x.Email == e && x.Id != u.Id, ct)) return Problems.Of(409, "email_taken", "這個 Email 已經被使用。");
                u.Email = e.Length == 0 ? null : e;
            }
            if (r.Phone is not null) u.Phone = r.Phone.Trim();
            if (r.LineId is not null) u.LineId = r.LineId.Trim();
            if (r.VoiceType is not null) u.VoiceType = r.VoiceType.Trim();
            if (r.Goal is not null) u.Goal = r.Goal.Trim()[..Math.Min(300, r.Goal.Trim().Length)];
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { u.Id });
        });

        s.MapGet("/payments", async (HttpContext http, AppDbContext db, CancellationToken ct) =>
        {
            var me = http.User.UserId();
            var list = await db.Payments.AsNoTracking().Include(p => p.Student).Where(p => p.StudentId == me).OrderByDescending(p => p.UploadedAtUtc).ToListAsync(ct);
            return TypedResults.Ok(list.Select(Map.Payment).ToArray());
        });

        s.MapPost("/payments", async (IFormCollection form, HttpContext http, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
        {
            var me = http.User.UserId();
            var u = await db.Users.FirstAsync(x => x.Id == me, ct);
            if (u.Credits > 0) return Problems.Of(409, "has_credits", "還有堂數可以用，用完後才能購買新方案。");
            if (await db.Payments.AnyAsync(p => p.StudentId == me && p.Status == PaymentStatus.Pending, ct)) return Problems.Of(409, "pending_exists", "已經有一張收據在等老師確認。");
            if (!int.TryParse(form["packageSize"], out var size) || o.Value.Packages.FirstOrDefault(p => p.Size == size) is not { } pkg) return Problems.Of(400, "validation", "請選擇方案。");
            var file = form.Files["receipt"];
            if (file is null || file.Length == 0) return Problems.Of(400, "validation", "請上傳收據圖片。");
            if (file.Length > ImageService.MaxBytes) return Problems.Of(400, "too_large", "圖片不能超過 5 MB。");

            await using var mem = new MemoryStream();
            await file.CopyToAsync(mem, ct);
            var type = await ImageService.DetectAsync(mem, ct);
            if (type is null) return Problems.Of(400, "bad_image", "只接受 JPG、PNG 或 WEBP 圖片。");
            var lqip = await ImageService.MakeLqipAsync(mem, ct);

            var folder = Path.Combine(env.ContentRootPath, o.Value.ReceiptsFolder);
            Directory.CreateDirectory(folder);
            var name = $"{Guid.NewGuid():N}{type switch { "image/png" => ".png", "image/webp" => ".webp", _ => ".jpg" }}";
            await File.WriteAllBytesAsync(Path.Combine(folder, name), mem.ToArray(), ct);

            var note = form["note"].ToString().Trim();
            var p = new Payment { StudentId = me, PackageSize = pkg.Size, Amount = pkg.Price, ReceiptPath = name, ContentType = type, Lqip = lqip, Note = note.Length == 0 ? null : note[..Math.Min(200, note.Length)] };
            db.Payments.Add(p);
            await db.SaveChangesAsync(ct);
            p.Student = u;
            return Results.Created($"/api/receipts/{p.Id}", Map.Payment(p));
        }).AddEndpointFilter<IdempotencyFilter>().DisableAntiforgery();

        // Receipt images: only the uploader or Iris (bank details are private).
        app.MapGet("/api/receipts/{id:guid}", async (Guid id, HttpContext http, AppDbContext db, IOptions<StudioOptions> o, IWebHostEnvironment env, CancellationToken ct) =>
        {
            var p = await db.Payments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            var me = http.User.UserId();
            if (p is null || (!http.User.IsInRole("Teacher") && p.StudentId != me)) return Results.NotFound();
            var path = Path.Combine(env.ContentRootPath, o.Value.ReceiptsFolder, Path.GetFileName(p.ReceiptPath));
            http.Response.Headers.CacheControl = "private, max-age=3600";
            return File.Exists(path) ? Results.File(path, p.ContentType) : Results.NotFound();
        }).RequireAuthorization();
    }
}
