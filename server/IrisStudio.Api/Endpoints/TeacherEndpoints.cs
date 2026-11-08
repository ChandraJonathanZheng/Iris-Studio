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
                await db.ChangeRequests.CountAsync(c => c.Status == ChangeStatus.Open && c.ProposedBy == ChangeBy.Student, ct),
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
            return TypedResults.Ok(new StudentDetailDto(s.Id, s.Name, s.Status, s.ClassType, s.Credits, s.Booked, s.NextLesson, s.PaymentPending, s.LineId, s.VoiceType,
                u.Email, u.Phone, u.Grade, u.Goal, lessons.Count(l => l.Status == LessonStatus.Attended), u.PackageSize,
                lessons.Where(l => l.Status == LessonStatus.Booked && !clock.IsPast(l.Date, l.Time)).Select(M).ToArray(),
                lessons.Where(l => l.Status == LessonStatus.Attended).Reverse().Select(M).ToArray(),
                pays.Select(Map.Payment).ToArray(),
                RemindChannel(u),
                await db.Alerts.Where(a => a.UserId == id && a.Kind == AlertKind.Reminder).MaxAsync(a => (DateTime?)a.CreatedAtUtc, ct) is { } last
                    ? DateTime.SpecifyKind(last, DateTimeKind.Utc) : null));
        });

        // 通知學生繳學費 — manual payment reminder. It goes through the normal alert outbox: queued for the usual
        // delay (so 復原 works), then the IAlertChannel delivers it (LINE push if the student signed in with LINE,
        // otherwise email) and it also shows in the student's in-app 通知.
        static string? RemindChannel(User u) => u.LineUserId is not null ? "line" : u.Email is not null ? "email" : null;

        t.MapPost("/students/{id:guid}/remind", async (Guid id, RemindRequest r, AppDbContext db, AlertService alerts, CancellationToken ct) =>
        {
            var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
            if (u is null) return Problems.Of(404, "not_found", "找不到學生。");
            var text = (r.Message ?? "").Trim();
            if (text.Length is 0 or > 500) return Problems.Of(400, "validation", "訊息需要 1–500 個字。");
            if (RemindChannel(u) is not { } channel) return Problems.Of(409, "no_channel", "這位學生沒有 LINE 或 Email，無法通知。");
            var rid = Guid.NewGuid();
            alerts.Add(u.Id, AlertKind.Reminder, "繳費提醒", text, source: $"remind:{rid}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(new RemindResult(rid, channel));
        });

        t.MapDelete("/reminders/{rid:guid}", async (Guid rid, AlertService alerts, CancellationToken ct) =>
        {
            await alerts.DropQueuedAsync($"remind:{rid}", ct);
            return Results.Ok();
        });

        t.MapPost("/students/{id:guid}/credits", async (Guid id, DeltaRequest r, HttpContext http, BookingService booking, CancellationToken ct) =>
            TypedResults.Ok(new CreditsDto(await booking.AdjustCreditsAsync(id, r.Delta, r.Reason, http.User.UserId(), ct))));

        t.MapPatch("/students/{id:guid}/class-type", async (Guid id, ClassTypeRequest r, AppDbContext db, CancellationToken ct) =>
        {
            if (!Enum.TryParse<LessonType>(r.ClassType, ignoreCase: true, out var type)) return Problems.Of(400, "validation", "類型不正確。");
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student).ExecuteUpdateAsync(s => s.SetProperty(u => u.ClassType, type), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到學生。") : Results.NoContent();
        });

        t.MapPatch("/students/{id:guid}/grade", async (Guid id, string grade, AppDbContext db, CancellationToken ct) =>
        {
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student).ExecuteUpdateAsync(s => s.SetProperty(u => u.Grade, grade.Trim()), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到學生。") : Results.NoContent();
        });

        t.MapGet("/requests", async (AppDbContext db, StudioClock clock, AvailabilityService availability, CancellationToken ct) =>
        {
            var open = await db.ChangeRequests.AsNoTracking().Include(c => c.Lesson).ThenInclude(l => l.Student)
                .Where(c => c.Status == ChangeStatus.Open && c.ProposedBy == ChangeBy.Student).OrderBy(c => c.CreatedAtUtc).ToListAsync(ct);
            var gap = (await availability.GetAsync(ct)).Settings.GapMinutes;
            var dates = open.Select(c => c.ToDate).Distinct().ToList();
            var taken = await db.Lessons.Where(l => l.Status == LessonStatus.Booked && dates.Contains(l.Date)).Select(l => new { l.Id, l.Date, l.Time, l.DurationMinutes }).ToListAsync(ct);
            var changes = open.Select(c => new ChangeRequestDto(c.Id, c.LessonId, c.Lesson.StudentId, c.Lesson.Student.Name,
                Map.D(c.Lesson.Date), Map.T(c.Lesson.Time), Map.D(c.ToDate), Map.T(c.ToTime), c.Reason,
                SlotFree: !clock.IsPast(c.ToDate, c.ToTime) && !taken.Any(x => x.Date == c.ToDate && x.Id != c.LessonId && AvailabilityService.Overlaps(c.ToTime, c.Lesson.DurationMinutes, x.Time, x.DurationMinutes, gap)),
                DateTime.SpecifyKind(c.CreatedAtUtc, DateTimeKind.Utc))).ToArray();
            var apps = await db.Users.AsNoTracking().Where(u => u.Role == Role.Student && u.Status == UserStatus.Pending && !u.Declined)
                .OrderBy(u => u.CreatedAtUtc).Select(u => new ApplicationDto(u.Id, u.Name, u.Email, u.CreatedAtUtc)).ToArrayAsync(ct);
            var week = clock.UtcNow.AddDays(-7);
            var props = await db.ChangeRequests.AsNoTracking().Include(c => c.Lesson).ThenInclude(l => l.Student)
                .Where(c => c.ProposedBy == ChangeBy.Teacher && (c.Status == ChangeStatus.Open || (c.Status != ChangeStatus.Withdrawn && c.DecidedAtUtc > week)))
                .OrderByDescending(c => c.CreatedAtUtc).ToListAsync(ct);
            var proposals = props.Select(c => new ProposalDto(c.Id, c.LessonId, c.Lesson.StudentId, c.Lesson.Student.Name,
                Map.D(c.PrevDate ?? c.Lesson.Date), Map.T(c.PrevTime ?? c.Lesson.Time), Map.D(c.ToDate), Map.T(c.ToTime), c.Reason, c.Status.Camel(),
                DateTime.SpecifyKind(c.CreatedAtUtc, DateTimeKind.Utc), c.DecidedAtUtc is { } x ? DateTime.SpecifyKind(x, DateTimeKind.Utc) : null)).ToArray();
            return TypedResults.Ok(new RequestsDto(changes, apps, proposals));
        });

        // 老師提議改時間: Iris suggests a new slot, the lesson only moves when the student accepts.
        t.MapPost("/lessons/{id:guid}/proposals", async (Guid id, ProposeRequest r, BookingService b, CancellationToken ct) =>
        {
            if (!Map.TryParseSlot(r.Date, r.Time, out var d, out var tm)) return Problems.Of(400, "validation", "日期或時間格式不正確。");
            var c = await b.ProposeMoveAsync(id, d, tm, r.Message, ct);
            return Results.Created($"/api/teacher/proposals/{c.Id}", new { c.Id });
        });
        t.MapPost("/proposals/{id:guid}/withdraw", async (Guid id, BookingService b, CancellationToken ct) => { await b.WithdrawProposalAsync(id, ct); return Results.NoContent(); });

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

        // ---------- 可預約時段 (availability) ----------
        static TimeRangeDto[] Dto(IEnumerable<TimeRange> rs) => rs.Select(r => new TimeRangeDto(Map.T(r.Start), Map.T(r.End))).ToArray();
        static async Task<AvailabilityDto> Load(AvailabilityService availability, CancellationToken ct)
        {
            availability.Invalidate();
            var av = await availability.GetAsync(ct);
            var weekly = Enumerable.Range(0, 7).Select(w => av.Weekly.TryGetValue(w, out var d)
                ? new WeeklyDayDto(w, d.Enabled, Dto(AvailabilityService.ParseRanges(d.Ranges)))
                : new WeeklyDayDto(w, false, [])).ToArray();
            var overrides = av.Overrides.Values.OrderBy(o => o.Date)
                .Select(o => new DateOverrideDto(Map.D(o.Date), o.Closed, Dto(AvailabilityService.ParseRanges(o.Ranges)), o.Note)).ToArray();
            var s = av.Settings;
            return new AvailabilityDto(new BookingSettingsDto(s.LessonMinutes, s.GapMinutes, s.AdvanceDays), weekly, overrides);
        }
        /// <summary>null = invalid input (bad time format).</summary>
        static TimeRange[]? Parse(TimeRangeDto[]? rs)
        {
            var list = new List<TimeRange>();
            foreach (var r in rs ?? [])
            {
                if (!TimeOnly.TryParseExact(r.Start, "HH:mm", out var a) || !TimeOnly.TryParseExact(r.End, "HH:mm", out var b)) return null;
                list.Add(new TimeRange(a, b));
            }
            return list.ToArray();
        }

        t.MapGet("/availability", async (AvailabilityService availability, CancellationToken ct) => TypedResults.Ok(await Load(availability, ct)));

        t.MapPut("/availability/settings", async (BookingSettingsDto r, AppDbContext db, AvailabilityService availability, CancellationToken ct) =>
        {
            if (!AvailabilityService.LessonMinuteOptions.Contains(r.LessonMinutes) || !AvailabilityService.GapMinuteOptions.Contains(r.GapMinutes)
                || !AvailabilityService.AdvanceDayOptions.Contains(r.AdvanceDays))
                return Problems.Of(400, "validation", "設定值不正確。");
            var s = await db.BookingSettings.FirstOrDefaultAsync(ct);
            if (s is null) { s = new BookingSettings(); db.BookingSettings.Add(s); }
            s.LessonMinutes = r.LessonMinutes; s.GapMinutes = r.GapMinutes; s.AdvanceDays = r.AdvanceDays;
            await db.SaveChangesAsync(ct);
            return Results.Ok(await Load(availability, ct));
        });

        t.MapPut("/availability/weekly", async (WeeklyDayDto[] r, AppDbContext db, AvailabilityService availability, CancellationToken ct) =>
        {
            if (r.Length != 7 || r.Select(d => d.Weekday).Distinct().Count() != 7 || r.Any(d => d.Weekday is < 0 or > 6))
                return Problems.Of(400, "validation", "資料格式不正確。");
            var lessonMinutes = (await availability.GetAsync(ct)).Settings.LessonMinutes;
            var rows = await db.WeeklyAvailability.ToDictionaryAsync(w => w.Weekday, ct);
            foreach (var d in r)
            {
                var ranges = Parse(d.Ranges);
                if (ranges is null) return Problems.Of(400, "validation", "時間格式不正確。");
                if (d.Enabled && AvailabilityService.RangeProblems(ranges, lessonMinutes) is [var first, ..]) return Problems.Of(400, "invalid_range", first);
                if (!rows.TryGetValue(d.Weekday, out var row)) { row = new WeeklyAvailability { Weekday = d.Weekday }; db.WeeklyAvailability.Add(row); }
                row.Enabled = d.Enabled;
                row.Ranges = AvailabilityService.FormatRanges(ranges); // kept while OFF, so switching a day back on restores its hours
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(await Load(availability, ct));
        });

        t.MapPut("/availability/overrides/{date}", async (string date, OverrideRequest r, AppDbContext db, StudioClock clock, AvailabilityService availability, CancellationToken ct) =>
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d) || d < clock.Today) return Problems.Of(400, "validation", "請選擇今天以後的日期。");
            var ranges = Parse(r.Ranges);
            if (ranges is null) return Problems.Of(400, "validation", "時間格式不正確。");
            if (!r.Closed)
            {
                if (ranges.Length == 0) return Problems.Of(400, "validation", "請至少加一個時段，或改成全天休息。");
                if (AvailabilityService.RangeProblems(ranges, (await availability.GetAsync(ct)).Settings.LessonMinutes) is [var first, ..]) return Problems.Of(400, "invalid_range", first);
            }
            var row = await db.DateOverrides.FirstOrDefaultAsync(o => o.Date == d, ct);
            if (row is null) { row = new DateOverride { Date = d }; db.DateOverrides.Add(row); }
            row.Closed = r.Closed;
            row.Ranges = r.Closed ? "" : AvailabilityService.FormatRanges(ranges);
            var note = (r.Note ?? "").Trim();
            row.Note = note[..Math.Min(60, note.Length)];
            await db.SaveChangesAsync(ct);
            return Results.Ok(await Load(availability, ct));
        });

        t.MapDelete("/availability/overrides/{date}", async (string date, AppDbContext db, AvailabilityService availability, CancellationToken ct) =>
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d)) return Problems.Of(400, "validation", "日期格式不正確。");
            await db.DateOverrides.Where(o => o.Date == d).ExecuteDeleteAsync(ct);
            return Results.Ok(await Load(availability, ct));
        });

        t.MapGet("/consults", async (AppDbContext db, CancellationToken ct) =>
            TypedResults.Ok(await db.Consults.AsNoTracking().OrderByDescending(c => c.CreatedAtUtc).Take(200)
                .Select(c => new ConsultDto(c.Id, c.Name, c.ContactType, c.Contact, c.PreferredTime, c.Topic, c.CreatedAtUtc, c.Contacted)).ToArrayAsync(ct)));
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
            return new StudentSummaryDto(u.Id, u.Name, u.Status.ToString(), u.ClassType.Camel(), u.Credits, mine.Count,
                next is null ? null : new NextLessonDto(Map.D(next.Date), Map.T(next.Time)), paying.Contains(u.Id), u.LineId, u.VoiceType);
        }).ToArray();
    }
}
