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
                await db.LessonReports.CountAsync(r => r.Status == ReportStatus.Open, ct),
                await db.Users.CountAsync(u => u.Role == Role.Student && u.Status == UserStatus.Pending && !u.Declined, ct),
                await db.Consults.CountAsync(c => !c.Contacted, ct));
            var outIds = await db.Users.Where(u => u.Role == Role.Student && u.Status == UserStatus.Active && u.Credits == 0).Select(u => u.Id).ToListAsync(ct);
            var todayIds = lessons.Select(l => l.Id).ToList();
            var notes = await db.LessonNotes.AsNoTracking().Where(n => todayIds.Contains(n.LessonId)).ToDictionaryAsync(n => n.LessonId, n => n.Kind, ct);
            return TypedResults.Ok(new OverviewDto(
                lessons.Select(l => Map.Lesson(l, o.Value.Room, null) with { NoteKind = notes.TryGetValue(l.Id, out var k) ? (k == LessonNoteKind.Text ? "text" : "image") : null }).ToArray(), counts,
                await Summaries(db, clock, outIds, ct)));
        });

        t.MapGet("/lessons", async (string from, string to, AppDbContext db, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            if (!DateOnly.TryParse(from, out var f) || !DateOnly.TryParse(to, out var u)) return Problems.Of(400, "validation", "日期格式不正確。");
            var lessons = await db.Lessons.AsNoTracking().Include(l => l.Student).Where(l => l.Date >= f && l.Date <= u)
                .OrderBy(l => l.Date).ThenBy(l => l.Time).ToListAsync(ct);
            var ids = lessons.Select(l => l.Id).ToList();
            var open = await db.ChangeRequests.AsNoTracking().Where(c => ids.Contains(c.LessonId) && c.Status == ChangeStatus.Open).ToListAsync(ct);
            var notes = await db.LessonNotes.AsNoTracking().Where(n => ids.Contains(n.LessonId)).ToDictionaryAsync(n => n.LessonId, n => n.Kind, ct);
            return TypedResults.Ok(lessons.Select(l => Map.Lesson(l, o.Value.Room, open.FirstOrDefault(c => c.LessonId == l.Id))
                with { NoteKind = notes.TryGetValue(l.Id, out var k) ? (k == LessonNoteKind.Text ? "text" : "image") : null }).ToArray());
        });

        // 13 Nov: Iris no longer books for students — booking is the student's own action (POST /api/student/lessons).

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

        t.MapGet("/students/{id:guid}", async (Guid id, AppDbContext db, StudioClock clock, IOptions<StudioOptions> o, ConsentService consents, CancellationToken ct) =>
        {
            var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
            if (u is null) return Problems.Of(404, "not_found", "找不到學生。");
            var s = (await Summaries(db, clock, [id], ct))[0];
            var lessons = await db.Lessons.AsNoTracking().Include(l => l.Student).Where(l => l.StudentId == id).OrderBy(l => l.Date).ThenBy(l => l.Time).ToListAsync(ct);
            var open = await db.ChangeRequests.AsNoTracking().Where(c => c.Lesson.StudentId == id && c.Status == ChangeStatus.Open).ToListAsync(ct);
            var pays = await db.Payments.AsNoTracking().Include(p => p.Student).Include(p => p.Fees).ThenInclude(f => f.Lesson)
                .Where(p => p.StudentId == id).OrderByDescending(p => p.UploadedAtUtc).ToListAsync(ct);
            var reports = await ReportView.LoadAsync(db, lessons.Select(l => l.Id).ToList(), clock, o.Value, ct);
            LessonDto M(Lesson l) => Map.Lesson(l, o.Value.Room, open.FirstOrDefault(c => c.LessonId == l.Id), reports);
            return TypedResults.Ok(new StudentDetailDto(s.Id, s.Name, s.Status, s.ClassType, s.Credits, s.Booked, s.NextLesson, s.PaymentPending, s.LineId, s.VoiceType,
                u.Email, u.Phone, u.Grade, u.Goal, lessons.Count(l => l.Status == LessonStatus.Attended), u.PackageSize,
                lessons.Where(l => l.Status == LessonStatus.Booked && !clock.IsPast(l.Date, l.Time)).Select(M).ToArray(),
                lessons.Where(l => l.Status == LessonStatus.Attended || l.CancelledByReport).Reverse().Select(M).ToArray(),
                pays.Select(Map.Payment).ToArray(),
                RemindChannel(u),
                await db.Alerts.Where(a => a.UserId == id && a.Kind == AlertKind.Reminder).MaxAsync(a => (DateTime?)a.CreatedAtUtc, ct) is { } last
                    ? DateTime.SpecifyKind(last, DateTimeKind.Utc) : null,
                await consents.SummaryAsync(id, ct), s.ConsultationCompleted,
                s.StudentNo, s.Gender, s.JoinedAt, s.AvatarUrl, s.Disabled, s.Segment,
                // 最初上課: the first lesson, or the start date Iris recorded if that is earlier (students from before the app)
                new[] { lessons.Where(l => l.Status != LessonStatus.Cancelled).Select(l => (DateOnly?)l.Date).Min(), u.JoinedOn }.Where(x => x is not null).Min() is { } first && lessons.Count > 0 ? Map.D(first) : null,
                pays.Where(p => p.Status == PaymentStatus.Confirmed).Select(p => (DateTime?)DateTime.SpecifyKind(p.UploadedAtUtc, DateTimeKind.Utc)).Min(),
                pays.Where(p => p.Status == PaymentStatus.Confirmed).Sum(p => p.Amount),
                u.LineUserId is not null ? "line" : "email",
                u.Skills.ToArray(), u.GrowthLevel,
                lessons.Count(l => l.Status == LessonStatus.Cancelled && (l.CancelledByReport || !l.Refunded)),
                lessons.Count(l => l.Status != LessonStatus.Cancelled),
                await db.ChangeRequests.Where(c => c.Lesson.StudentId == id && c.Status == ChangeStatus.Approved).Select(c => c.LessonId).Distinct().ToArrayAsync(ct),
                u.CoverUrl));
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

        // 已完成諮詢／面談 → the student may buy one 單堂課
        t.MapPatch("/students/{id:guid}/consultation", async (Guid id, ConsultationRequest r, AppDbContext db, CancellationToken ct) =>
        {
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student).ExecuteUpdateAsync(s => s.SetProperty(u => u.ConsultationCompleted, r.ConsultationCompleted), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到學生。") : Results.NoContent();
        });

        // 停用 / 重新啟用. A disabled student keeps everything (lessons already booked, credits, history) but can't book new lessons.
        t.MapPatch("/students/{id:guid}/status", async (Guid id, StudentStatusRequest r, AppDbContext db, StudioClock clock, CancellationToken ct) =>
        {
            DateTime? at = r.Disabled ? clock.UtcNow : null;
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.DisabledAtUtc, u => r.Disabled ? (u.DisabledAtUtc ?? at) : null), ct);
            if (n == 0) return Problems.Of(404, "not_found", "找不到學生。");
            return Results.Ok((await Summaries(db, clock, [id], ct))[0]);
        });

        // 給筆記 (only Iris sees it) / 給作業 (the student gets an alert and sees it on their page)
        t.MapPost("/students/{id:guid}/notes", async (Guid id, StudentNoteRequest r, HttpContext http, AppDbContext db, AlertService alerts, CancellationToken ct) =>
        {
            if (!await db.Users.AnyAsync(u => u.Id == id && u.Role == Role.Student, ct)) return Problems.Of(404, "not_found", "找不到學生。");
            if (!Enum.TryParse<StudentNoteKind>(r.Kind, ignoreCase: true, out var kind)) return Problems.Of(400, "validation", "類型不正確。");
            var text = (r.Text ?? "").Trim();
            if (text.Length == 0) return Problems.Of(400, "validation", "請輸入內容。");
            if (text.Length > 1000) return Problems.Of(400, "validation", "內容最多 1000 字。");
            var note = new StudentNote { StudentId = id, Kind = kind, Text = text, ByUserId = http.User.UserId() };
            db.StudentNotes.Add(note);
            if (kind == StudentNoteKind.Homework)
                alerts.Add(id, AlertKind.Homework, "老師給你新的作業", text.Length > 80 ? text[..80] + "…" : text, source: $"homework:{note.Id}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/teacher/students/{id}/notes/{note.Id}",
                new StudentNoteDto(note.Id, id, kind.Camel(), note.Text, DateTime.SpecifyKind(note.CreatedAtUtc, DateTimeKind.Utc)));
        });

        t.MapGet("/students/{id:guid}/notes", async (Guid id, AppDbContext db, CancellationToken ct) =>
            TypedResults.Ok(await db.StudentNotes.AsNoTracking().Where(n => n.StudentId == id).OrderByDescending(n => n.CreatedAtUtc)
                .Select(n => new StudentNoteDto(n.Id, n.StudentId, n.Kind == StudentNoteKind.Homework ? "homework" : "note", n.Text, DateTime.SpecifyKind(n.CreatedAtUtc, DateTimeKind.Utc)))
                .ToListAsync(ct)));

        // ---------- 課程方案 (packages & prices) — Iris edits them herself ----------
        t.MapPut("/packages", async (PackagesRequest r, PackageService packages, CancellationToken ct) =>
            await packages.ReplaceAsync(r.Packages, ct) is { } problem ? Problems.Of(400, "validation", problem) : Results.Ok(await packages.GetAsync(ct)));

        // 技能徽章: the whole list is replaced (trimmed, de-duplicated, ≤ 12 × ≤ 20 chars)
        t.MapPut("/students/{id:guid}/skills", async (Guid id, SkillsRequest r, AppDbContext db, CancellationToken ct) =>
        {
            var list = (r.Skills ?? []).Select(x => (x ?? "").Trim()).Where(x => x.Length > 0).Distinct().ToList();
            if (list.Count > 12) return Problems.Of(400, "validation", "最多 12 個徽章。");
            if (list.Any(x => x.Length > 20)) return Problems.Of(400, "validation", "每個徽章最多 20 個字。");
            var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
            if (u is null) return Problems.Of(404, "not_found", "找不到學生。");
            u.Skills = list;
            await db.SaveChangesAsync(ct);
            return Results.Ok(list);
        });

        // 成長等級 0–10
        t.MapPatch("/students/{id:guid}/growth", async (Guid id, GrowthRequest r, AppDbContext db, CancellationToken ct) =>
        {
            if (r.Level is < 0 or > 10) return Problems.Of(400, "validation", "等級需要是 0–10。");
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student).ExecuteUpdateAsync(s => s.SetProperty(u => u.GrowthLevel, r.Level), ct);
            return n == 0 ? Problems.Of(404, "not_found", "找不到學生。") : Results.NoContent();
        });

        // 聲部 + 程度 — Iris sets them (one sheet on 個人資料 › 基本資料). Empty = not set.
        t.MapPatch("/students/{id:guid}/basics", async (Guid id, StudentBasicsRequest r, AppDbContext db, CancellationToken ct) =>
        {
            var voice = (r.VoiceType ?? "").Trim();
            var grade = (r.Grade ?? "").Trim();
            if (voice.Length > 20 || grade.Length > 20) return Problems.Of(400, "validation", "最多 20 個字。");
            var n = await db.Users.Where(u => u.Id == id && u.Role == Role.Student).ExecuteUpdateAsync(s => s
                .SetProperty(u => u.VoiceType, voice.Length == 0 ? null : voice)
                .SetProperty(u => u.Grade, grade.Length == 0 ? null : grade), ct);
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
            var reports = await db.LessonReports.AsNoTracking().Include(r => r.Lesson).ThenInclude(l => l.Student)
                .Where(r => r.Status == ReportStatus.Open).OrderBy(r => r.CreatedAtUtc).ToListAsync(ct);
            var reportDtos = reports.Select(r => new LessonReportDto(r.Id, r.LessonId, r.Lesson.StudentId, r.Lesson.Student.Name, Map.D(r.Lesson.Date), Map.T(r.Lesson.Time),
                r.Lesson.DurationMinutes, r.Reason, DateTime.SpecifyKind(r.CreatedAtUtc, DateTimeKind.Utc))).ToArray();
            return TypedResults.Ok(new RequestsDto(changes, apps, proposals, reportDtos));
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

        // 回報 審核. Approve and decline change credits / fees, so they are idempotent like payments.
        t.MapPost("/reports/{id:guid}/approve", async (Guid id, DecideReportRequest r, HttpContext http, BookingService b, CancellationToken ct) =>
        { await b.DecideReportAsync(id, true, null, r.WaiveFee, http.User.UserId(), ct); return TypedResults.Ok(new { ok = true }); }).AddEndpointFilter<IdempotencyFilter>();
        t.MapPost("/reports/{id:guid}/decline", async (Guid id, DecideReportRequest r, HttpContext http, BookingService b, CancellationToken ct) =>
        { await b.DecideReportAsync(id, false, r.Message, false, http.User.UserId(), ct); return TypedResults.Ok(new { ok = true }); }).AddEndpointFilter<IdempotencyFilter>();
        t.MapPost("/reports/{id:guid}/undo", async (Guid id, HttpContext http, BookingService b, CancellationToken ct) =>
        { await b.UndoReportAsync(id, http.User.UserId(), ct); return Results.NoContent(); });

        t.MapPost("/applications/{id:guid}/{action}", async (Guid id, string action, AppDbContext db, AlertService alerts, StudioClock clock, IOptions<StudioOptions> o, CancellationToken ct) =>
        {
            var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.Role == Role.Student, ct);
            if (u is null) return Problems.Of(404, "not_found", "找不到申請。");
            switch (action)
            {
                case "approve" when u.Status == UserStatus.Pending && !u.Declined:
                    u.Status = UserStatus.Active;
                    // 學號 + start date for the 學生列表 (kept if the approval is undone and redone)
                    u.StudentNo ??= (await db.Users.MaxAsync(x => x.StudentNo, ct) ?? 1000) + 1;
                    u.JoinedOn ??= clock.Today;
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
            var q = db.Payments.AsNoTracking().Include(p => p.Student).Include(p => p.Fees).ThenInclude(f => f.Lesson).AsQueryable();
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

    /// <summary>List-row data for students: credits, booked count, next lesson, payment waiting, 學生列表 columns + segment.</summary>
    private static async Task<StudentSummaryDto[]> Summaries(AppDbContext db, StudioClock clock, List<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];
        var users = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToListAsync(ct);
        var today = clock.Today;
        // every non-cancelled lesson: next lesson, booked count and the 3-month activity rule all come from it
        var lessons = await db.Lessons.AsNoTracking().Where(l => ids.Contains(l.StudentId) && l.Status != LessonStatus.Cancelled)
            .Select(l => new { l.StudentId, l.Date, l.Time, l.Status }).ToListAsync(ct);
        var paying = await db.Payments.Where(p => ids.Contains(p.StudentId) && p.Status == PaymentStatus.Pending).Select(p => p.StudentId).ToListAsync(ct);
        var bought = await db.Payments.Where(p => ids.Contains(p.StudentId) && p.Status == PaymentStatus.Confirmed)
            .GroupBy(p => p.StudentId).Select(g => new { StudentId = g.Key, Last = g.Max(p => p.UploadedAtUtc) }).ToListAsync(ct);
        var now = clock.UtcNow;
        return ids.Select(id => users.First(u => u.Id == id)).Select(u =>
        {
            var mineAll = lessons.Where(l => l.StudentId == u.Id).ToList();
            var mine = mineAll.Where(l => l.Status == LessonStatus.Booked && l.Date >= today && !clock.IsPast(l.Date, l.Time)).OrderBy(l => l.Date).ThenBy(l => l.Time).ToList();
            var next = mine.FirstOrDefault();
            var started = mineAll.Where(l => clock.IsPast(l.Date, l.Time)).Select(l => (DateTime?)clock.ToUtc(l.Date, l.Time)).Max();
            var lastBuy = bought.FirstOrDefault(b => b.StudentId == u.Id)?.Last;
            return new StudentSummaryDto(u.Id, u.Name, u.Status.ToString(), u.ClassType.Camel(), u.Credits, mine.Count,
                next is null ? null : new NextLessonDto(Map.D(next.Date), Map.T(next.Time)), paying.Contains(u.Id), u.LineId, u.VoiceType, u.ConsultationCompleted,
                u.StudentNo ?? 0, u.Gender switch { Gender.Male => "M", Gender.Female => "F", _ => null }, JoinedAt(u, clock), u.AvatarUrl, u.DisabledAtUtc is not null,
                StudentSegments.Classify(u, now, started, mine.Count > 0, lastBuy is { } lb ? DateTime.SpecifyKind(lb, DateTimeKind.Utc) : null));
        }).ToArray();
    }

    /// <summary>上課資年 starts here: JoinedOn (set on approval, editable) or, for old rows, the sign-up time.</summary>
    private static DateTime JoinedAt(User u, StudioClock clock) =>
        u.JoinedOn is { } d ? clock.ToUtc(d, new TimeOnly(12, 0)) : DateTime.SpecifyKind(u.CreatedAtUtc, DateTimeKind.Utc);
}
