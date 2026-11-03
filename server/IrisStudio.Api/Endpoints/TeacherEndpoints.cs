using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Endpoints;

public static class TeacherEndpoints
{
    public static void MapTeacher(this IEndpointRouteBuilder app)
    {
        var t = app.MapGroup("/api/teacher").RequireAuthorization("Teacher");

        t.MapGet("/overview", async (AppDbContext db, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            var today = clock.Today;
            var lessons = await db.Lessons.AsNoTracking().Include(l => l.Student).Where(l => l.Date == today && l.Status != LessonStatus.Cancelled)
                .OrderBy(l => l.Time).ToListAsync(ct);
            var pending = await db.Payments.Where(p => p.Status == PaymentStatus.Pending).Select(p => p.Amount).ToListAsync(ct);
            var counts = new CountsDto(
                pending.Count, pending.Sum(),
                await db.ChangeRequests.CountAsync(c => c.Status == ChangeStatus.Open, ct),
                await db.Users.CountAsync(u => u.Role == Role.Student && u.Status == UserStatus.Pending && !u.Declined, ct),
                await db.Consults.CountAsync(c => !c.Contacted, ct));
            var outIds = await db.Users.Where(u => u.Role == Role.Student && u.Status == UserStatus.Active && u.Credits == 0).Select(u => u.Id).ToListAsync(ct);
            return TypedResults.Ok(new OverviewDto(
                lessons.Select(l => Map.Lesson(l, o.Value.Room, null)).ToArray(), counts,
                await Summaries(db, clock, outIds, ct)));
        });

        t.MapGet("/lessons", async (string from, string to, AppDbContext db, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            if (!DateOnly.TryParse(from, out var f) || !DateOnly.TryParse(to, out var u)) return Problems.Of(400, "validation", "日期格式不正確。");
            var lessons = await db.Lessons.AsNoTracking().Include(l => l.Student).Where(l => l.Date >= f && l.Date <= u)
                .OrderBy(l => l.Date).ThenBy(l => l.Time).ToListAsync(ct);
            var ids = lessons.Select(l => l.Id).ToList();
            var open = await db.ChangeRequests.AsNoTracking().Where(c => ids.Contains(c.LessonId) && c.Status == ChangeStatus.Open).ToListAsync(ct);
            return TypedResults.Ok(lessons.Select(l => Map.Lesson(l, o.Value.Room, open.FirstOrDefault(c => c.LessonId == l.Id))).ToArray());
        });

        t.MapPost("/lessons", async (BookRequest r, Guid studentId, BookingService booking, CancellationToken ct) =>
        {
            if (!Map.TryParseSlot(r.Date, r.Time, out var d, out var tm)) return Problems.Of(400, "validation", "日期或時間格式不正確。");
            var l = await booking.BookAsync(studentId, d, tm, byTeacher: true, ct);
            return Results.Created($"/api/teacher/lessons/{l.Id}", new { l.Id });
        }).AddEndpointFilter<IdempotencyFilter>();

        t.MapPost("/lessons/{id:guid}/cancel", async (Guid id, BookingService booking, CancellationToken ct) =>
        {
            await booking.CancelAsync(id, studentId: null, ct);
            return Results.NoContent();
        });
        t.MapPost("/lessons/{id:guid}/undo-cancel", async (Guid id, BookingService booking, CancellationToken ct) =>
        {
            await booking.UndoCancelAsync(id, studentId: null, ct);
            return Results.NoContent();
        });

        t.MapGet("/students", async (AppDbContext db, StudioClock clock, CancellationToken ct) =>
        {
            var ids = await db.Users.Where(u => u.Role == Role.Student && !u.Declined).OrderBy(u => u.Name).Select(u => u.Id).ToListAsync(ct);
            return TypedResults.Ok(await Summaries(db, clock, ids, ct));
        });

        t.MapGet("/students/{id:guid}", async (Guid id, AppDbContext db, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
            if (u is null) return Problems.Of(404, "not_found", "找不到學生。");
            var s = (await Summaries(db, clock, [id], ct))[0];
            var lessons = await db.Lessons.AsNoTracking().Include(l => l.Student).Where(l => l.StudentId == id).OrderBy(l => l.Date).ThenBy(l => l.Time).ToListAsync(ct);
            var open = await db.ChangeRequests.AsNoTracking().Where(c => c.Lesson.StudentId == id && c.Status == ChangeStatus.Open).ToListAsync(ct);
            var pays = await db.Payments.AsNoTracking().Include(p => p.Student).Where(p => p.StudentId == id).OrderByDescending(p => p.UploadedAtUtc).ToListAsync(ct);
            LessonDto M(Lesson l) => Map.Lesson(l, o.Value.Room, open.FirstOrDefault(c => c.LessonId == l.Id));
            return TypedResults.Ok(new StudentDetailDto(s.Id, s.Name, s.Status, s.Credits, s.Booked, s.NextLesson, s.PaymentPending, s.LineId, s.VoiceType,
                u.Email, u.Phone, u.Grade, u.Goal, lessons.Count(l => l.Status == LessonStatus.Attended), u.PackageSize,
                lessons.Where(l => l.Status == LessonStatus.Booked && !clock.IsPast(l.Date, l.Time)).Select(M).ToArray(),
                lessons.Where(l => l.Status == LessonStatus.Attended).Reverse().Select(M).ToArray(),
                pays.Select(Map.Payment).ToArray()));
        });

        t.MapPost("/students/{id:guid}/credits", async (Guid id, DeltaRequest r, HttpContext http, BookingService booking, CancellationToken ct) =>
            TypedResults.Ok(new CreditsDto(await booking.AdjustCreditsAsync(id, r.Delta, http.User.UserId(), ct))));

        t.MapPatch("/students/{id:guid}/grade", async (Guid id, string grade, AppDbContext db, CancellationToken ct) =>
        {
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student).ExecuteUpdateAsync(s => s.SetProperty(u => u.Grade, grade.Trim()), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到學生。") : Results.NoContent();
        });

        t.MapGet("/requests", async (AppDbContext db, StudioClock clock, CancellationToken ct) =>
        {
            var open = await db.ChangeRequests.AsNoTracking().Include(c => c.Lesson).ThenInclude(l => l.Student)
                .Where(c => c.Status == ChangeStatus.Open).OrderBy(c => c.CreatedAtUtc).ToListAsync(ct);
            var taken = await db.Lessons.Where(l => l.Status == LessonStatus.Booked).Select(l => new { l.Id, l.Date, l.Time }).ToListAsync(ct);
            var changes = open.Select(c => new ChangeRequestDto(c.Id, c.LessonId, c.Lesson.StudentId, c.Lesson.Student.Name,
                Map.D(c.Lesson.Date), Map.T(c.Lesson.Time), Map.D(c.ToDate), Map.T(c.ToTime), c.Reason,
                SlotFree: !clock.IsPast(c.ToDate, c.ToTime) && !taken.Any(x => x.Date == c.ToDate && x.Time == c.ToTime && x.Id != c.LessonId),
                DateTime.SpecifyKind(c.CreatedAtUtc, DateTimeKind.Utc))).ToArray();
            var apps = await db.Users.AsNoTracking().Where(u => u.Role == Role.Student && u.Status == UserStatus.Pending && !u.Declined)
                .OrderBy(u => u.CreatedAtUtc).Select(u => new ApplicationDto(u.Id, u.Name, u.Email, u.CreatedAtUtc)).ToArrayAsync(ct);
            return TypedResults.Ok(new RequestsDto(changes, apps));
        });

        t.MapPost("/change-requests/{id:guid}/approve", async (Guid id, BookingService b, CancellationToken ct) => { await b.DecideChangeAsync(id, true, null, ct); return Results.NoContent(); });
        t.MapPost("/change-requests/{id:guid}/decline", async (Guid id, MessageRequest r, BookingService b, CancellationToken ct) => { await b.DecideChangeAsync(id, false, r.Message, ct); return Results.NoContent(); });
        t.MapPost("/change-requests/{id:guid}/undo", async (Guid id, BookingService b, CancellationToken ct) => { await b.UndoChangeAsync(id, ct); return Results.NoContent(); });

        t.MapPost("/applications/{id:guid}/{action}", async (Guid id, string action, AppDbContext db, AlertService alerts, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
            if (u is null) return Problems.Of(404, "not_found", "找不到申請。");
            switch (action)
            {
                case "approve" when u.Status == UserStatus.Pending && !u.Declined:
                    u.Status = UserStatus.Active;
                    alerts.Add(u.Id, AlertKind.Welcome, "歡迎加入 Iris 聲樂工作室", "帳號已確認，可以開始預約。", $"app:{u.Id}");
                    break;
                case "decline" when u.Status == UserStatus.Pending && !u.Declined:
                    u.Declined = true;
                    break;
                case "undo":
                    if (u.DecidedAtUtc is null || clock.UtcNow - u.DecidedAtUtc > o.Value.UndoWindow) return Problems.Of(409, "undo_expired", "已超過可以復原的時間。");
                    u.Status = UserStatus.Pending; u.Declined = false; u.DecidedAtUtc = null;
                    await alerts.DropQueuedAsync($"app:{u.Id}", ct);
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                default:
                    return Problems.Of(409, "already_handled", "這個申請已經處理過了。");
            }
            u.DecidedAtUtc = clock.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        t.MapGet("/payments", async (string? status, AppDbContext db, CancellationToken ct) =>
        {
            var q = db.Payments.AsNoTracking().Include(p => p.Student).AsQueryable();
            if (Enum.TryParse<PaymentStatus>(status, out var st)) q = q.Where(p => p.Status == st);
            var list = await q.OrderByDescending(p => p.UploadedAtUtc).Take(200).ToListAsync(ct);
            return TypedResults.Ok(list.Select(Map.Payment).ToArray());
        });

        t.MapPost("/payments/{id:guid}/confirm", async (Guid id, HttpContext http, BookingService b, CancellationToken ct) =>
        { await b.DecidePaymentAsync(id, true, null, http.User.UserId(), ct); return TypedResults.Ok(new { ok = true }); }).AddEndpointFilter<IdempotencyFilter>();
        t.MapPost("/payments/{id:guid}/reject", async (Guid id, ReasonRequest r, HttpContext http, BookingService b, CancellationToken ct) =>
        { await b.DecidePaymentAsync(id, false, r.Reason, http.User.UserId(), ct); return TypedResults.Ok(new { ok = true }); }).AddEndpointFilter<IdempotencyFilter>();
        t.MapPost("/payments/{id:guid}/undo", async (Guid id, HttpContext http, BookingService b, CancellationToken ct) =>
        { await b.UndoPaymentAsync(id, http.User.UserId(), ct); return Results.NoContent(); });

        t.MapGet("/consults", async (AppDbContext db, CancellationToken ct) =>
            TypedResults.Ok(await db.Consults.AsNoTracking().OrderByDescending(c => c.CreatedAtUtc).Take(200)
                .Select(c => new ConsultDto(c.Id, c.Name, c.Contact, c.PreferredDate.ToString("yyyy-MM-dd"), c.Topic, c.CreatedAtUtc, c.Contacted)).ToArrayAsync(ct)));
        t.MapPost("/consults/{id:guid}/contacted", async (Guid id, ContactedRequest r, AppDbContext db, CancellationToken ct) =>
        {
            var n = await db.Consults.Where(c => c.Id == id).ExecuteUpdateAsync(s => s.SetProperty(c => c.Contacted, r.Contacted), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到。") : Results.NoContent();
        });
    }

    /// <summary>List-row data for students: credits, booked count, next lesson, payment waiting.</summary>
    private static async Task<StudentSummaryDto[]> Summaries(AppDbContext db, StudioClock clock, List<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];
        var users = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToListAsync(ct);
        var today = clock.Today;
        var upcoming = await db.Lessons.AsNoTracking().Where(l => ids.Contains(l.StudentId) && l.Status == LessonStatus.Booked && l.Date >= today)
            .Select(l => new { l.StudentId, l.Date, l.Time }).ToListAsync(ct);
        var paying = await db.Payments.Where(p => ids.Contains(p.StudentId) && p.Status == PaymentStatus.Pending).Select(p => p.StudentId).ToListAsync(ct);
        return ids.Select(id => users.First(u => u.Id == id)).Select(u =>
        {
            var mine = upcoming.Where(l => l.StudentId == u.Id && !clock.IsPast(l.Date, l.Time)).OrderBy(l => l.Date).ThenBy(l => l.Time).ToList();
            var next = mine.FirstOrDefault();
            return new StudentSummaryDto(u.Id, u.Name, u.Status.ToString(), u.Credits, mine.Count,
                next is null ? null : new NextLessonDto(Map.D(next.Date), Map.T(next.Time)), paying.Contains(u.Id), u.LineId, u.VoiceType);
        }).ToArray();
    }
}
