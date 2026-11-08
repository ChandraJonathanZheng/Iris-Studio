using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

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
    public async Task EnsureValidSlotAsync(DateOnly date, TimeOnly time, CancellationToken ct)
    {
        var av = await availability.GetAsync(ct);
        if (date > clock.Today.AddDays(av.Settings.AdvanceDays)) throw new BizException(400, "too_far", $"最多只能預約 {av.Settings.AdvanceDays} 天內的課。");
        if (av.RangesFor(date).Count == 0) throw new BizException(400, "closed_day", "這天不開放預約。");
        if (!av.SlotTimesFor(date).Contains(time)) throw new BizException(400, "invalid_slot", "這不是上課時段。");
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
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({date.DayNumber})", ct);
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
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var r = await work();
        await tx.CommitAsync(ct);
        return r;
    }

    private static bool IsSlotConflict(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "UX_Lesson_Slot_Booked" };

    // ---------- booking ----------
    public Task<Lesson> BookAsync(Guid studentId, DateOnly date, TimeOnly time, bool byTeacher, CancellationToken ct) => InTx(async () =>
    {
        await EnsureValidSlotAsync(date, time, ct);
        if (await IsTakenAsync(date, time, null, ct)) throw new BizException(409, "slot_taken", "這個時段剛被別人預約了。沒有扣堂數，請選其他時段。");

        // Atomic "take one credit if there is one": two devices booking at once can't both succeed.
        var taken = await db.Users.Where(u => u.Id == studentId && u.Credits > 0)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Credits, u => u.Credits - 1), ct);
        if (taken == 0) throw new BizException(409, "no_credits", "堂數已用完，請先購買新方案。");

        var student = await db.Users.AsNoTracking().FirstAsync(u => u.Id == studentId, ct);
        // the lesson's type follows the student's class type: a 體驗 student's lesson is a 體驗課
        var lesson = new Lesson { StudentId = studentId, Date = date, Time = time, Type = student.ClassType, DurationMinutes = (await availability.GetAsync(ct)).Settings.LessonMinutes };
        db.Lessons.Add(lesson);
        if (byTeacher) alerts.Add(studentId, AlertKind.Added, "老師新增了一堂課", $"{Fmt(date, time)} · {_o.Room}", $"add:{lesson.Id}");
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
        alerts.Add(student.Id, AlertKind.Reminder, "繳費提醒", "你的堂數已經用完了。想繼續上課的話，請到「堂數與付款」上傳匯款證明。", $"auto-remind:{lessonId}");
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
            await alerts.DropQueuedAsync($"auto-remind:{l.Id}", ct); // the credit is back, so the reminder isn't true anymore
        }
        await db.ChangeRequests.Where(c => c.LessonId == l.Id && c.Status == ChangeStatus.Open)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ChangeStatus.Withdrawn), ct);
        if (byTeacher) alerts.Add(l.StudentId, AlertKind.Cancelled, "老師取消了一堂課", $"{Fmt(l.Date, l.Time)} 已取消，堂數已退回。", $"cancel:{l.Id}");
        await db.SaveChangesAsync(ct);
        return (refund, l.Student.Credits);
    }, ct);

    public Task<bool> UndoCancelAsync(Guid lessonId, Guid? studentId, CancellationToken ct) => InTx(async () =>
    {
        var l = await db.Lessons.Include(x => x.Student).FirstOrDefaultAsync(x => x.Id == lessonId && (studentId == null || x.StudentId == studentId), ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (l.Status != LessonStatus.Cancelled || l.CancelledAtUtc is null || clock.UtcNow - l.CancelledAtUtc > _o.UndoWindow)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        if (await IsTakenAsync(l.Date, l.Time, l.Id, ct, l.DurationMinutes)) throw new BizException(409, "slot_taken", "這個時段已經被別人預約了。");
        if (l.Refunded)
        {
            if (l.Student.Credits < 1) throw new BizException(409, "no_credits", "堂數已經被用掉，無法復原。");
            l.Student.Credits -= 1;
        }
        l.Status = LessonStatus.Booked;
        l.CancelledAtUtc = null;
        l.Refunded = false;
        await alerts.DropQueuedAsync($"cancel:{l.Id}", ct);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsSlotConflict(ex)) { throw new BizException(409, "slot_taken", "這個時段已經被別人預約了。"); }
        return true;
    }, ct);

    // ---------- change requests ----------
    public async Task<ChangeRequest> AskMoveAsync(Guid studentId, Guid lessonId, DateOnly date, TimeOnly time, string? reason, CancellationToken ct)
    {
        var l = await db.Lessons.FirstOrDefaultAsync(x => x.Id == lessonId && x.StudentId == studentId && x.Status == LessonStatus.Booked, ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (await db.ChangeRequests.AnyAsync(c => c.LessonId == l.Id && c.Status == ChangeStatus.Open, ct))
            throw new BizException(409, "already_open", "這堂課已經有一個改時間申請。");
        // too close to the lesson: Iris has no time to react, so the student has to cancel instead
        if (clock.ToUtc(l.Date, l.Time) - clock.UtcNow < TimeSpan.FromHours(_o.MoveHours))
            throw new BizException(409, "too_late_to_move", $"上課前 {_o.MoveHours} 小時內不能改時間，如果無法上課請取消預約。");
        await EnsureValidSlotAsync(date, time, ct);
        if (await IsTakenAsync(date, time, l.Id, ct, l.DurationMinutes)) throw new BizException(409, "slot_taken", "這個時段已經有人了。");
        var c = new ChangeRequest { LessonId = l.Id, ToDate = date, ToTime = time, Reason = (reason ?? "").Trim() };
        db.ChangeRequests.Add(c);
        await db.SaveChangesAsync(ct); // original slot stays booked until Iris approves
        return c;
    }

    public Task<bool> DecideChangeAsync(Guid changeId, bool approve, string? message, CancellationToken ct) => InTx(async () =>
    {
        var c = await db.ChangeRequests.Include(x => x.Lesson).FirstOrDefaultAsync(x => x.Id == changeId && x.ProposedBy == ChangeBy.Student, ct)
            ?? throw new BizException(404, "not_found", "找不到申請。");
        if (c.Status != ChangeStatus.Open) throw new BizException(409, "already_handled", "這個申請已經處理過了。");
        var l = c.Lesson;
        if (approve)
        {
            if (clock.IsPast(c.ToDate, c.ToTime) || await IsTakenAsync(c.ToDate, c.ToTime, l.Id, ct, l.DurationMinutes))
                throw new BizException(409, "slot_taken", "新時段已被預約，只能婉拒。");
            c.PrevDate = l.Date; c.PrevTime = l.Time;
            l.Date = c.ToDate; l.Time = c.ToTime;
            c.Status = ChangeStatus.Approved;
            alerts.Add(l.StudentId, AlertKind.Approved, "老師同意改時間", $"{Fmt(c.PrevDate.Value, c.PrevTime.Value)} 改到 {Fmt(c.ToDate, c.ToTime)}。", $"change:{c.Id}");
        }
        else
        {
            c.Status = ChangeStatus.Declined;
            var body = string.IsNullOrWhiteSpace(message) ? $"{Fmt(l.Date, l.Time)} 的課維持不變。" : message.Trim();
            alerts.Add(l.StudentId, AlertKind.Declined, "老師無法改到這個時間", body, $"change:{c.Id}");
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
        if (clock.IsPast(date, time)) throw new BizException(400, "validation", "請選擇未來的時段。");
        if (date == l.Date && time == l.Time) throw new BizException(400, "validation", "新時段和原本的一樣。");
        var open = await db.ChangeRequests.FirstOrDefaultAsync(c => c.LessonId == l.Id && c.Status == ChangeStatus.Open, ct);
        if (open?.ProposedBy == ChangeBy.Teacher) throw new BizException(409, "already_open", "已經提議過了，請等學生回覆，或先收回。");
        if (open is not null)
        {
            // Iris answers the student's request with another time: the request is declined, and the proposal
            // (one notification, with her message) replaces it.
            open.Status = ChangeStatus.Declined;
            open.DecidedAtUtc = clock.UtcNow;
        }
        if (await IsTakenAsync(date, time, l.Id, ct, l.DurationMinutes)) throw new BizException(409, "slot_taken", "這個時段已經有人了。");
        var c = new ChangeRequest { LessonId = l.Id, ToDate = date, ToTime = time, Reason = (message ?? "").Trim(), ProposedBy = ChangeBy.Teacher };
        db.ChangeRequests.Add(c);
        var body = $"{Fmt(l.Date, l.Time)} → {Fmt(date, time)}。請到首頁回覆可以或不方便。" + (c.Reason.Length > 0 ? $"\n老師：{c.Reason}" : "");
        alerts.Add(l.StudentId, AlertKind.Proposal, "老師想調整上課時間", body, $"change:{c.Id}");
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
        if (accept)
        {
            if (clock.IsPast(c.ToDate, c.ToTime) || await IsTakenAsync(c.ToDate, c.ToTime, l.Id, ct, l.DurationMinutes))
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
        var c = await db.ChangeRequests.Include(x => x.Lesson).FirstOrDefaultAsync(x => x.Id == changeId, ct)
            ?? throw new BizException(404, "not_found", "找不到申請。");
        if (c.DecidedAtUtc is null || clock.UtcNow - c.DecidedAtUtc > _o.UndoWindow || c.Status is ChangeStatus.Open or ChangeStatus.Withdrawn)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        if (c.Status == ChangeStatus.Approved && c.PrevDate is { } d && c.PrevTime is { } t)
        {
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
            p.Student.PackageSize = p.PackageSize;
            db.CreditLogs.Add(new CreditLog { StudentId = p.StudentId, Delta = p.PackageSize, Reason = $"payment:{p.Id}", ByUserId = byUserId });
            alerts.Add(p.StudentId, AlertKind.Payment, "付款已確認", $"{p.PackageSize} 堂已加入，現在剩餘 {p.Student.Credits} 堂。", $"pay:{p.Id}");
        }
        else
        {
            if (string.IsNullOrWhiteSpace(reason)) throw new BizException(400, "validation", "請填寫退回原因。");
            p.Status = PaymentStatus.Rejected;
            p.RejectReason = reason.Trim();
            alerts.Add(p.StudentId, AlertKind.Payment, "收據被退回", p.RejectReason, $"pay:{p.Id}");
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
        if (p.Status == PaymentStatus.Confirmed)
        {
            if (p.Student.Credits < p.PackageSize) throw new BizException(409, "credits_used", "學生已經用了部分堂數，無法復原。");
            p.Student.Credits -= p.PackageSize;
            db.CreditLogs.Add(new CreditLog { StudentId = p.StudentId, Delta = -p.PackageSize, Reason = $"undo-payment:{p.Id}", ByUserId = byUserId });
        }
        p.Status = PaymentStatus.Pending;
        p.RejectReason = null;
        p.DecidedAtUtc = null;
        await alerts.DropQueuedAsync($"pay:{p.Id}", ct);
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    // ---------- manual credit adjustment ----------
    public Task<int> AdjustCreditsAsync(Guid studentId, int delta, string? reason, Guid byUserId, CancellationToken ct) => InTx(async () =>
    {
        if (delta is 0 or > 50 or < -50) throw new BizException(400, "validation", "調整數量不正確。");
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == studentId && x.Role == Role.Student, ct) ?? throw new BizException(404, "not_found", "找不到學生。");
        if (u.Credits + delta < 0) throw new BizException(409, "negative", "堂數不能小於 0。");
        u.Credits += delta;
        var note = reason?.Trim();
        if (note is { Length: > 200 }) note = note[..200];
        db.CreditLogs.Add(new CreditLog { StudentId = u.Id, Delta = delta, Reason = string.IsNullOrEmpty(note) ? "manual" : $"manual: {note}", ByUserId = byUserId });
        alerts.Add(u.Id, AlertKind.Added, "老師調整了你的堂數", $"現在剩餘 {u.Credits} 堂。", $"credits:{u.Id}");
        await db.SaveChangesAsync(ct);
        return u.Credits;
    }, ct);
}
