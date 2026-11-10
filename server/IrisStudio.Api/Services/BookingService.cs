using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>A business rule said no. Turned into a 4xx problem response with a stable `code` the client can check.</summary>
public class BizException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

/// <summary>
/// ALL lesson and quota rules live here, so student booking, teacher actions, approvals and undo
/// share the same checks (closed days, valid slots, not in the past, slot free, credits ≥ 0).
/// </summary>
public class BookingService(AppDbContext db, StudioClock clock, AlertService alerts, AvailabilityService availability, IOptions<StudioOptions> options)
{
    private readonly StudioOptions _o = options.Value;

    public static string Fmt(DateOnly d, TimeOnly t)
    {
        string[] wd = ["日", "一", "二", "三", "四", "五", "六"];
        return $"{d:MM-dd}({wd[(int)d.DayOfWeek]}) {t:HH\\:mm}";
    }

    // ---------- slot rules ----------
    /// <summary>The slot must be one Iris's 可預約時段 generates for that date, in the future, and within 可提前預約.</summary>
    public async Task EnsureValidSlotAsync(DateOnly date, TimeOnly time, CancellationToken ct, int? durationMinutes = null)
    {
        var av = await availability.GetAsync(ct);
        if (date > clock.Today.AddDays(av.Settings.AdvanceDays)) throw new BizException(400, "too_far", $"最多只能預約 {av.Settings.AdvanceDays} 天內的課。");
        if (av.RangesFor(date).Count == 0) throw new BizException(400, "closed_day", "這天不開放預約。");
        if (!av.CanFit(date, time, durationMinutes ?? av.Settings.LessonMinutes)) throw new BizException(400, "invalid_slot", "這不是上課時段。");
        if (clock.IsPast(date, time)) throw new BizException(400, "past_slot", "這個時段已經過了。");
    }

    /// <summary>
    /// Taken = any booked lesson on that date overlaps [time, time + length), break included. Overlap (not "same start")
    /// matters once Iris changes the lesson length or break: older lessons sit on a different grid.
    /// The per-date advisory lock makes two bookings for the same day check-and-insert one after the other,
    /// so overlapping (not identical) starts can't both slip through; the unique index still guards identical starts.
    /// </summary>
    public async Task<bool> IsTakenAsync(DateOnly date, TimeOnly time, Guid? exceptLessonId, CancellationToken ct, int? minutes = null)
    {
        if (db.Database.CurrentTransaction is not null)
            await StudioTransaction.AcquireLockAsync(db, date.DayNumber, ct);
        var av = await availability.GetAsync(ct);
        var length = minutes ?? av.Settings.LessonMinutes;
        var booked = await db.Lessons.Where(l => l.Date == date && l.Status == LessonStatus.Booked && l.Id != exceptLessonId)
            .Select(l => new { l.Time, l.DurationMinutes }).ToListAsync(ct);
        return booked.Any(b => AvailabilityService.Overlaps(time, length, b.Time, b.DurationMinutes, av.Settings.GapMinutes));
    }

    /// <summary>Runs work in a transaction, or joins the one the idempotency filter already opened.</summary>
    private async Task<T> InTx<T>(Func<Task<T>> work, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null) return await work();
        await using var tx = await StudioTransaction.BeginAsync(db, ct);
        var r = await work();
        await tx.CommitAsync(ct);
        return r;
    }

    private static bool IsSlotConflict(DbUpdateException ex) =>
        DatabaseErrors.IsUniqueViolation(ex, "UX_Lesson_Slot_Booked");

    // ---------- booking ----------
    public Task<Lesson> BookAsync(Guid studentId, DateOnly date, TimeOnly time, bool byTeacher, CancellationToken ct) => InTx(async () =>
    {
        var eligible = await db.Users.AnyAsync(u => u.Id == studentId && u.Role == Role.Student && u.Status == UserStatus.Active && !u.Declined, ct);
        if (!eligible) throw new BizException(409, "inactive_student", "學生帳號尚未通過確認。");
        await EnsureValidSlotAsync(date, time, ct);
        if (await IsTakenAsync(date, time, null, ct)) throw new BizException(409, "slot_taken", "這個時段剛被別人預約了。沒有扣堂數，請選其他時段。");

        // Atomic "take one credit if there is one": two devices booking at once can't both succeed.
        var taken = await db.Users.Where(u => u.Id == studentId && u.Credits > 0)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Credits, u => u.Credits - 1), ct);
        if (taken == 0) throw new BizException(409, "no_credits", "堂數已用完，請先購買新方案。");

        var student = await db.Users.AsNoTracking().FirstAsync(u => u.Id == studentId, ct);
        // The lesson's type follows the student's class type (一對一 / 團體課 / 單堂課).
        var lesson = new Lesson { StudentId = studentId, Date = date, Time = time, Type = student.ClassType, CreatedAtUtc = clock.UtcNow, DurationMinutes = (await availability.GetAsync(ct)).Settings.LessonMinutes };
        db.Lessons.Add(lesson);
        db.CreditLogs.Add(new CreditLog { StudentId = studentId, Delta = -1, Reason = $"booking:{lesson.Id}", CreatedAtUtc = clock.UtcNow });
        if (byTeacher) alerts.Add(studentId, AlertKind.Added, "老師新增了一堂課", $"{Fmt(date, time)} · {_o.Room}", $"add:{lesson.Id}");
        var booked = EmailFormat.Lesson(lesson, _o, LessonStatus.Booked);
        booked["intro"] = byTeacher ? "Iris 為你新增了一堂課，期待和你見面。" : "你的課程已經預約完成，期待和你見面。";
        booked["credits"] = student.Credits.ToString();
        // delayed past the undo window; the send-time guard drops it if the lesson is cancelled first
        await alerts.EmailAsync(student, "booking-confirmed", booked, $"booked:{lesson.Id}", byTeacher ? $"add:{lesson.Id}" : $"book:{lesson.Id}", ct: ct);
        if (student.Credits == 1)
            await alerts.EmailAsync(student, "credits-low", new() { ["credits"] = "1" }, $"credits-low:{lesson.Id}", $"auto-remind:{lesson.Id}", ct: ct);
        await AutoRemindAsync(student, lesson.Id, ct);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsSlotConflict(ex))
        {
            // Lost the race at the database (the unique index). The transaction rolls back, so the credit comes back too.
            throw new BizException(409, "slot_taken", "這個時段剛被別人預約了。沒有扣堂數，請選其他時段。");
        }
        return lesson;
    }, ct);

    /// <summary>
    /// Automatic 繳費提醒 (decided 8 Nov): the booking that uses the last credit queues a reminder.
    /// Skipped when a receipt is already waiting, or when the student got a reminder in the last 24 h
    /// (manual or automatic), so nobody gets nagged twice. The source ties it to the lesson,
    /// so cancelling that lesson inside the alert delay drops it again.
    /// </summary>
    private async Task AutoRemindAsync(User student, Guid lessonId, CancellationToken ct)
    {
        if (student.Credits > 0) return;
        if (await db.Payments.AnyAsync(p => p.StudentId == student.Id && p.Status == PaymentStatus.Pending, ct)) return;
        var since = clock.UtcNow.AddHours(-24);
        if (await db.Alerts.AnyAsync(a => a.UserId == student.Id && a.Kind == AlertKind.Reminder && a.CreatedAtUtc > since, ct)) return;
        const string text = "你的堂數已經用完了。想繼續上課的話，請到「堂數與付款」上傳匯款證明。";
        alerts.Add(student.Id, AlertKind.Reminder, "繳費提醒", text, $"auto-remind:{lessonId}");
        await alerts.EmailAsync(student, "payment-reminder", new() { ["message"] = text, ["credits"] = "0" }, $"auto-remind:{lessonId}", $"auto-remind:{lessonId}", ct: ct);
    }

    // ---------- cancel + undo ----------
    public Task<(bool refunded, int creditsLeft)> CancelAsync(Guid lessonId, Guid? studentId, CancellationToken ct) => InTx(async () =>
    {
        var l = await db.Lessons.Include(x => x.Student).FirstOrDefaultAsync(x => x.Id == lessonId && (studentId == null || x.StudentId == studentId), ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (l.Status != LessonStatus.Booked) throw new BizException(409, "not_booked", "這堂課已經不是預約狀態。");
        if (clock.IsPast(l.Date, l.Time)) throw new BizException(409, "started", "已經開始的課不能取消。");

        var byTeacher = studentId is null;
        // Students: refund only ≥ 24 h before. Iris's cancellations always refund.
        var refund = byTeacher || clock.ToUtc(l.Date, l.Time) - clock.UtcNow >= TimeSpan.FromHours(_o.CancelHours);
        l.Status = LessonStatus.Cancelled;
        l.CancelledAtUtc = clock.UtcNow;
        l.Refunded = refund;
        l.CancelledByTeacher = byTeacher;
        if (refund)
        {
            l.Student.Credits += 1;
            db.CreditLogs.Add(new CreditLog { StudentId = l.StudentId, Delta = 1, Reason = $"cancel:{l.Id}", CreatedAtUtc = clock.UtcNow });
            await alerts.DropQueuedAsync($"auto-remind:{l.Id}", ct); // the credit is back, so the reminder isn't true anymore
        }
        await db.ChangeRequests.Where(c => c.LessonId == l.Id && c.Status == ChangeStatus.Open)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ChangeStatus.Withdrawn), ct);
        if (byTeacher) alerts.Add(l.StudentId, AlertKind.Cancelled, "老師取消了一堂課", $"{Fmt(l.Date, l.Time)} 已取消，堂數已退回。", $"cancel:{l.Id}");
        var cancelled = EmailFormat.Lesson(l, _o, LessonStatus.Cancelled);
        cancelled["intro"] = byTeacher ? "Iris 取消了這堂課，造成不便很抱歉。堂數已經退回你的帳號。" : "你已取消這堂課。";
        cancelled["refund"] = refund ? "已退回 1 堂" : $"未退回（上課前 {_o.CancelHours} 小時內取消）";
        cancelled["credits"] = l.Student.Credits.ToString();
        // source cancel:{id}: undo-cancel drops it, and the send-time guard checks the lesson is still cancelled
        await alerts.EmailAsync(l.Student, "booking-cancelled", cancelled, $"cancelled:{l.Id}", $"cancel:{l.Id}", ct: ct);
        await db.SaveChangesAsync(ct);
        return (refund, l.Student.Credits);
    }, ct);

    public Task<bool> UndoCancelAsync(Guid lessonId, Guid? studentId, CancellationToken ct) => InTx(async () =>
    {
        var l = await db.Lessons.Include(x => x.Student).FirstOrDefaultAsync(x => x.Id == lessonId && (studentId == null || x.StudentId == studentId), ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (l.Status != LessonStatus.Cancelled || l.CancelledAtUtc is null || clock.UtcNow - l.CancelledAtUtc > _o.UndoWindow)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        if (l.CancelledByTeacher != (studentId is null)) throw new BizException(403, "forbidden", "只能復原自己的取消。");
        if (clock.IsPast(l.Date, l.Time)) throw new BizException(409, "started", "課程已開始，無法復原。");
        if (await IsTakenAsync(l.Date, l.Time, l.Id, ct, l.DurationMinutes)) throw new BizException(409, "slot_taken", "這個時段已經被別人預約了。");
        if (l.Refunded)
        {
            if (l.Student.Credits < 1) throw new BizException(409, "no_credits", "堂數已經被用掉，無法復原。");
            l.Student.Credits -= 1;
            db.CreditLogs.Add(new CreditLog { StudentId = l.StudentId, Delta = -1, Reason = $"undo-cancel:{l.Id}", CreatedAtUtc = clock.UtcNow });
        }
        l.Status = LessonStatus.Booked;
        l.CancelledAtUtc = null;
        l.Refunded = false;
        l.CancelledByTeacher = false;
        await AutoRemindAsync(l.Student, l.Id, ct);
        await alerts.DropQueuedAsync($"cancel:{l.Id}", ct);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsSlotConflict(ex)) { throw new BizException(409, "slot_taken", "這個時段已經被別人預約了。"); }
        return true;
    }, ct);

    // ---------- change requests ----------
    public Task<ChangeRequest> AskMoveAsync(Guid studentId, Guid lessonId, DateOnly date, TimeOnly time, string? reason, CancellationToken ct) => InTx(async () =>
    {
        var l = await db.Lessons.FirstOrDefaultAsync(x => x.Id == lessonId && x.StudentId == studentId && x.Status == LessonStatus.Booked, ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (await db.ChangeRequests.AnyAsync(c => c.LessonId == l.Id && c.Status == ChangeStatus.Open, ct))
            throw new BizException(409, "already_open", "這堂課已經有一個改時間申請。");
        // too close to the lesson: Iris has no time to react, so the student has to cancel instead
        if (clock.ToUtc(l.Date, l.Time) - clock.UtcNow < TimeSpan.FromHours(_o.MoveHours))
            throw new BizException(409, "too_late_to_move", $"上課前 {_o.MoveHours} 小時內不能改時間，如果無法上課請取消預約。");
        if (date == l.Date && time == l.Time) throw new BizException(400, "validation", "新時段和原本的一樣。");
        if (reason?.Trim().Length > 300) throw new BizException(400, "validation", "原因不能超過 300 個字。");
        await EnsureValidSlotAsync(date, time, ct, l.DurationMinutes);
        if (await IsTakenAsync(date, time, l.Id, ct, l.DurationMinutes)) throw new BizException(409, "slot_taken", "這個時段已經有人了。");
        var c = new ChangeRequest { CreatedAtUtc = clock.UtcNow, LessonId = l.Id, ToDate = date, ToTime = time, Reason = (reason ?? "").Trim() };
        db.ChangeRequests.Add(c);
        var student = await db.Users.FirstAsync(u => u.Id == studentId, ct);
        Dictionary<string, string> Move() => new()
        {
            ["studentName"] = student.Name, ["fromSlot"] = EmailFormat.Slot(l.Date, l.Time), ["toSlot"] = EmailFormat.Slot(date, time), ["reason"] = c.Reason,
            [EmailGuard.ChangeId] = c.Id.ToString(), [EmailGuard.ChangeStatus] = nameof(ChangeStatus.Open),
        };
        await alerts.EmailAsync(student, "reschedule-received", Move(), $"change-received:{c.Id}", delay: false, ct: ct);
        await alerts.EmailTeacherAsync("teacher-reschedule-request", Move(), $"teacher-change:{c.Id}", ct);
        await db.SaveChangesAsync(ct); // original slot stays booked until Iris approves
        return c;
    }, ct);

    public Task<bool> DecideChangeAsync(Guid changeId, bool approve, string? message, CancellationToken ct) => InTx(async () =>
    {
        var c = await db.ChangeRequests.Include(x => x.Lesson).FirstOrDefaultAsync(x => x.Id == changeId && x.ProposedBy == ChangeBy.Student, ct)
            ?? throw new BizException(404, "not_found", "找不到申請。");
        if (c.Status != ChangeStatus.Open) throw new BizException(409, "already_handled", "這個申請已經處理過了。");
        var l = c.Lesson;
        EnsureUpcoming(l);
        if (message?.Trim().Length > 300) throw new BizException(400, "validation", "訊息不能超過 300 個字。");
        if (approve)
        {
            await EnsureValidSlotAsync(c.ToDate, c.ToTime, ct, l.DurationMinutes);
            if (await IsTakenAsync(c.ToDate, c.ToTime, l.Id, ct, l.DurationMinutes))
                throw new BizException(409, "slot_taken", "新時段已被預約，只能婉拒。");
            c.PrevDate = l.Date; c.PrevTime = l.Time;
            l.Date = c.ToDate; l.Time = c.ToTime;
            c.Status = ChangeStatus.Approved;
            alerts.Add(l.StudentId, AlertKind.Approved, "老師同意改時間", $"{Fmt(c.PrevDate.Value, c.PrevTime.Value)} 改到 {Fmt(c.ToDate, c.ToTime)}。", $"change:{c.Id}");
            await alerts.EmailAsync(l.StudentId, "reschedule-approved", new()
            {
                ["fromSlot"] = EmailFormat.Slot(c.PrevDate.Value, c.PrevTime.Value), ["toSlot"] = EmailFormat.Slot(c.ToDate, c.ToTime), ["room"] = _o.Room,
                [EmailGuard.ChangeId] = c.Id.ToString(), [EmailGuard.ChangeStatus] = nameof(ChangeStatus.Approved),
            }, $"change-approved:{c.Id}", $"change:{c.Id}", ct: ct);
        }
        else
        {
            c.Status = ChangeStatus.Declined;
            var body = string.IsNullOrWhiteSpace(message) ? $"{Fmt(l.Date, l.Time)} 的課維持不變。" : message.Trim();
            alerts.Add(l.StudentId, AlertKind.Declined, "老師無法改到這個時間", body, $"change:{c.Id}");
            await alerts.EmailAsync(l.StudentId, "reschedule-declined", new()
            {
                ["slot"] = EmailFormat.Slot(l.Date, l.Time), ["toSlot"] = EmailFormat.Slot(c.ToDate, c.ToTime), ["teacherMessage"] = message?.Trim() ?? "",
                [EmailGuard.ChangeId] = c.Id.ToString(), [EmailGuard.ChangeStatus] = nameof(ChangeStatus.Declined),
            }, $"change-declined:{c.Id}", $"change:{c.Id}", ct: ct);
        }
        c.DecidedAtUtc = clock.UtcNow;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsSlotConflict(ex)) { throw new BizException(409, "slot_taken", "新時段已被預約，只能婉拒。"); }
        return true;
    }, ct);

    // ---------- 老師提議改時間 (decided 8 Nov: Iris can't move a lesson on her own, the student must agree) ----------
    public Task<ChangeRequest> ProposeMoveAsync(Guid lessonId, DateOnly date, TimeOnly time, string? message, CancellationToken ct) => InTx(async () =>
    {
        var l = await db.Lessons.FirstOrDefaultAsync(x => x.Id == lessonId && x.Status == LessonStatus.Booked, ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (clock.IsPast(l.Date, l.Time)) throw new BizException(409, "started", "已經開始的課不能改時間。");
        await EnsureValidSlotAsync(date, time, ct, l.DurationMinutes);
        if (message?.Trim().Length > 300) throw new BizException(400, "validation", "訊息不能超過 300 個字。");
        if (date == l.Date && time == l.Time) throw new BizException(400, "validation", "新時段和原本的一樣。");
        var open = await db.ChangeRequests.FirstOrDefaultAsync(c => c.LessonId == l.Id && c.Status == ChangeStatus.Open, ct);
        if (open?.ProposedBy == ChangeBy.Teacher) throw new BizException(409, "already_open", "已經提議過了，請等學生回覆，或先收回。");
        if (open is not null)
        {
            // Iris answers the student's request with another time: the request is declined, and the proposal
            // (one notification, with her message) replaces it.
            open.Status = ChangeStatus.Declined;
            open.DecidedAtUtc = clock.UtcNow;
            await db.SaveChangesAsync(ct); // release the filtered unique index before inserting its replacement
        }
        if (await IsTakenAsync(date, time, l.Id, ct, l.DurationMinutes)) throw new BizException(409, "slot_taken", "這個時段已經有人了。");
        var c = new ChangeRequest { CreatedAtUtc = clock.UtcNow, LessonId = l.Id, ToDate = date, ToTime = time, Reason = (message ?? "").Trim(), ProposedBy = ChangeBy.Teacher };
        db.ChangeRequests.Add(c);
        var body = $"{Fmt(l.Date, l.Time)} → {Fmt(date, time)}。請到首頁回覆可以或不方便。" + (c.Reason.Length > 0 ? $"\n老師：{c.Reason}" : "");
        alerts.Add(l.StudentId, AlertKind.Proposal, "老師想調整上課時間", body, $"change:{c.Id}");
        await alerts.EmailAsync(l.StudentId, "reschedule-proposed", new()
        {
            ["fromSlot"] = EmailFormat.Slot(l.Date, l.Time), ["toSlot"] = EmailFormat.Slot(date, time), ["teacherMessage"] = c.Reason,
            [EmailGuard.ChangeId] = c.Id.ToString(), [EmailGuard.ChangeStatus] = nameof(ChangeStatus.Open),
        }, $"change-proposed:{c.Id}", $"change:{c.Id}", ct: ct);
        await db.SaveChangesAsync(ct); // the lesson keeps its slot until the student accepts
        return c;
    }, ct);

    public Task<bool> AnswerProposalAsync(Guid studentId, Guid changeId, bool accept, CancellationToken ct) => InTx(async () =>
    {
        var c = await db.ChangeRequests.Include(x => x.Lesson)
            .FirstOrDefaultAsync(x => x.Id == changeId && x.ProposedBy == ChangeBy.Teacher && x.Lesson.StudentId == studentId, ct)
            ?? throw new BizException(404, "not_found", "找不到老師的提議。");
        if (c.Status != ChangeStatus.Open) throw new BizException(409, "already_handled", "這個提議已經處理過了。");
        var l = c.Lesson;
        EnsureUpcoming(l);
        if (accept)
        {
            await EnsureValidSlotAsync(c.ToDate, c.ToTime, ct, l.DurationMinutes);
            if (await IsTakenAsync(c.ToDate, c.ToTime, l.Id, ct, l.DurationMinutes))
                throw new BizException(409, "slot_taken", "這個時段已經不能預約了，請和老師聯絡。");
            c.PrevDate = l.Date; c.PrevTime = l.Time;
            l.Date = c.ToDate; l.Time = c.ToTime;
            c.Status = ChangeStatus.Approved;
        }
        else c.Status = ChangeStatus.Declined; // the lesson stays where it was
        c.DecidedAtUtc = clock.UtcNow;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsSlotConflict(ex)) { throw new BizException(409, "slot_taken", "這個時段已經不能預約了，請和老師聯絡。"); }
        return true;
    }, ct);

    public Task<bool> WithdrawProposalAsync(Guid changeId, CancellationToken ct) => InTx(async () =>
    {
        var c = await db.ChangeRequests.FirstOrDefaultAsync(x => x.Id == changeId && x.ProposedBy == ChangeBy.Teacher && x.Status == ChangeStatus.Open, ct)
            ?? throw new BizException(404, "not_found", "找不到提議，可能學生已經回覆了。");
        c.Status = ChangeStatus.Withdrawn;
        c.DecidedAtUtc = clock.UtcNow;
        await alerts.DropQueuedAsync($"change:{c.Id}", ct);
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    public Task<bool> UndoChangeAsync(Guid changeId, CancellationToken ct) => InTx(async () =>
    {
        var c = await db.ChangeRequests.Include(x => x.Lesson).FirstOrDefaultAsync(x => x.Id == changeId && x.ProposedBy == ChangeBy.Student, ct)
            ?? throw new BizException(404, "not_found", "找不到申請。");
        EnsureUpcoming(c.Lesson);
        if (await db.ChangeRequests.AnyAsync(x => x.LessonId == c.LessonId && x.Id != c.Id && x.Status == ChangeStatus.Open, ct))
            throw new BizException(409, "already_open", "這堂課已經有另一個改時間申請。");
        if (c.DecidedAtUtc is null || clock.UtcNow - c.DecidedAtUtc > _o.UndoWindow || c.Status is ChangeStatus.Open or ChangeStatus.Withdrawn)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        if (c.Status == ChangeStatus.Approved && c.PrevDate is { } d && c.PrevTime is { } t)
        {
            if (clock.IsPast(d, t)) throw new BizException(409, "started", "原本的上課時間已經過了。");
            if (c.Lesson.Date != c.ToDate || c.Lesson.Time != c.ToTime) throw new BizException(409, "changed", "課程已有其他變動，無法復原。");
            if (await IsTakenAsync(d, t, c.LessonId, ct, c.Lesson.DurationMinutes)) throw new BizException(409, "slot_taken", "原本的時段已經被別人預約了。");
            c.Lesson.Date = d; c.Lesson.Time = t;
        }
        c.Status = ChangeStatus.Open;
        c.DecidedAtUtc = null;
        await alerts.DropQueuedAsync($"change:{c.Id}", ct);
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    // ---------- payments ----------
    public Task<bool> DecidePaymentAsync(Guid paymentId, bool confirm, string? reason, Guid byUserId, CancellationToken ct) => InTx(async () =>
    {
        var p = await db.Payments.Include(x => x.Student).FirstOrDefaultAsync(x => x.Id == paymentId, ct)
            ?? throw new BizException(404, "not_found", "找不到收據。");
        // Even without an idempotency key, a second "confirm" can never add the package twice.
        if (p.Status != PaymentStatus.Pending) throw new BizException(409, "already_handled", "這張收據已經處理過了。");
        if (confirm)
        {
            p.Status = PaymentStatus.Confirmed;
            p.Student.Credits += p.PackageSize;
            p.PreviousPackageSize = p.Student.PackageSize;
            p.Student.PackageSize = p.PackageSize;
            db.CreditLogs.Add(new CreditLog { StudentId = p.StudentId, Delta = p.PackageSize, Reason = $"payment:{p.Id}", ByUserId = byUserId, CreatedAtUtc = clock.UtcNow });
            alerts.Add(p.StudentId, AlertKind.Payment, "付款已確認", $"{p.PackageSize} 堂已加入，現在剩餘 {p.Student.Credits} 堂。", $"pay:{p.Id}");
            await alerts.EmailAsync(p.Student, "payment-confirmed", new()
            {
                ["packageName"] = EmailFormat.Package(p), ["amount"] = EmailFormat.Money(p.Amount), ["creditsAdded"] = p.PackageSize.ToString(), ["credits"] = p.Student.Credits.ToString(),
                [EmailGuard.PaymentId] = p.Id.ToString(), [EmailGuard.PaymentStatus] = nameof(PaymentStatus.Confirmed),
            }, $"pay-confirmed:{p.Id}", $"pay:{p.Id}", ct: ct);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(reason) || reason.Length > 300) throw new BizException(400, "validation", "請填寫退回原因。");
            p.Status = PaymentStatus.Rejected;
            p.RejectReason = reason.Trim();
            alerts.Add(p.StudentId, AlertKind.Payment, "收據被退回", p.RejectReason, $"pay:{p.Id}");
            await alerts.EmailAsync(p.Student, "receipt-rejected", new()
            {
                ["packageName"] = EmailFormat.Package(p), ["amount"] = EmailFormat.Money(p.Amount), ["reason"] = p.RejectReason,
                [EmailGuard.PaymentId] = p.Id.ToString(), [EmailGuard.PaymentStatus] = nameof(PaymentStatus.Rejected),
            }, $"pay-rejected:{p.Id}", $"pay:{p.Id}", ct: ct);
        }
        p.DecidedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    public Task<bool> UndoPaymentAsync(Guid paymentId, Guid byUserId, CancellationToken ct) => InTx(async () =>
    {
        var p = await db.Payments.Include(x => x.Student).FirstOrDefaultAsync(x => x.Id == paymentId, ct)
            ?? throw new BizException(404, "not_found", "找不到收據。");
        if (p.DecidedAtUtc is null || clock.UtcNow - p.DecidedAtUtc > _o.UndoWindow || p.Status == PaymentStatus.Pending)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        if (await db.Payments.AnyAsync(x => x.StudentId == p.StudentId && x.Id != p.Id && x.Status == PaymentStatus.Pending, ct))
            throw new BizException(409, "pending_exists", "已有另一張收據待確認，無法復原。");
        if (p.IsTrial && await db.Payments.AnyAsync(x => x.StudentId == p.StudentId && x.Id != p.Id && x.IsTrial && x.Status != PaymentStatus.Rejected, ct))
            throw new BizException(409, "trial_not_available", "已有另一張單堂課收據，無法復原。");
        if (p.Status == PaymentStatus.Confirmed)
        {
            if (p.Student.Credits < p.PackageSize) throw new BizException(409, "credits_used", "學生已經用了部分堂數，無法復原。");
            p.Student.Credits -= p.PackageSize;
            p.Student.PackageSize = await db.Payments.Where(x => x.StudentId == p.StudentId && x.Id != p.Id && x.Status == PaymentStatus.Confirmed)
                .OrderByDescending(x => x.DecidedAtUtc).Select(x => (int?)x.PackageSize).FirstOrDefaultAsync(ct) ?? p.PreviousPackageSize ?? 0;
            db.CreditLogs.Add(new CreditLog { StudentId = p.StudentId, Delta = -p.PackageSize, Reason = $"undo-payment:{p.Id}", ByUserId = byUserId, CreatedAtUtc = clock.UtcNow });
        }
        p.Status = PaymentStatus.Pending;
        p.RejectReason = null;
        p.DecidedAtUtc = null;
        await alerts.DropQueuedAsync($"pay:{p.Id}", ct);
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    // ---------- manual credit adjustment ----------
    public Task<CreditLog> AdjustCreditsAsync(Guid studentId, int delta, string? reason, Guid byUserId, CancellationToken ct) => InTx(async () =>
    {
        if (delta is 0 or > 4 or < -4) throw new BizException(400, "validation", "調整數量不正確。");
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == studentId && x.Role == Role.Student, ct) ?? throw new BizException(404, "not_found", "找不到學生。");
        if (u.Credits + delta < 0) throw new BizException(409, "negative", "堂數不能小於 0。");
        u.Credits += delta;
        var note = reason?.Trim();
        if (string.IsNullOrEmpty(note) || note.Length > 200) throw new BizException(400, "validation", "請填寫 1–200 個字的調整原因。");
        var log = new CreditLog { StudentId = u.Id, Delta = delta, Reason = $"manual: {note}", ByUserId = byUserId, CreatedAtUtc = clock.UtcNow };
        db.CreditLogs.Add(log);
        alerts.Add(u.Id, AlertKind.Added, "老師調整了你的堂數", $"現在剩餘 {u.Credits} 堂。", $"credits:{log.Id}");
        // the teacher's note stays internal; the student sees the change and the new balance
        await alerts.EmailAsync(u, delta > 0 ? "credits-returned" : "credits-updated",
            new() { ["delta"] = delta.ToString(), ["credits"] = u.Credits.ToString() }, $"credits:{log.Id}", $"credits:{log.Id}", ct: ct);
        await db.SaveChangesAsync(ct);
        return log;
    }, ct);

    public Task<int> UndoCreditsAsync(Guid logId, Guid byUserId, CancellationToken ct) => InTx(async () =>
    {
        var log = await db.CreditLogs.FirstOrDefaultAsync(x => x.Id == logId && x.ByUserId == byUserId && x.Reason.StartsWith("manual:"), ct)
            ?? throw new BizException(404, "not_found", "找不到調整紀錄。");
        if (log.UndoneAtUtc is not null || clock.UtcNow - log.CreatedAtUtc > _o.UndoWindow)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        var student = await db.Users.SingleAsync(u => u.Id == log.StudentId, ct);
        if (student.Credits - log.Delta < 0) throw new BizException(409, "credits_used", "堂數已經被用掉，無法復原。");
        student.Credits -= log.Delta;
        log.UndoneAtUtc = clock.UtcNow;
        db.CreditLogs.Add(new CreditLog { StudentId = student.Id, Delta = -log.Delta, Reason = $"undo-credits:{log.Id}", ByUserId = byUserId, CreatedAtUtc = clock.UtcNow });
        await alerts.DropQueuedAsync($"credits:{log.Id}", ct);
        await db.SaveChangesAsync(ct);
        return student.Credits;
    }, ct);

    private void EnsureUpcoming(Lesson lesson)
    {
        if (lesson.Status != LessonStatus.Booked || clock.IsPast(lesson.Date, lesson.Time))
            throw new BizException(409, "not_booked", "課程已開始或已取消，不能改時間。");
    }
}
