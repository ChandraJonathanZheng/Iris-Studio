using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

public partial class BookingService
{
    public Task<LessonReport> ReportAsync(Guid studentId, Guid lessonId, string? reason, CancellationToken ct) => InTx(async () =>
    {
        var lesson = await db.Lessons.SingleOrDefaultAsync(l => l.Id == lessonId && l.StudentId == studentId, ct)
            ?? throw new BizException(404, "not_found", "找不到這堂課。");
        if (lesson.Status != LessonStatus.Attended) throw new BizException(409, "not_attended", "只能回報已上課的課程。");
        var end = clock.ToUtc(lesson.Date, lesson.Time).AddMinutes(lesson.DurationMinutes);
        if (clock.UtcNow < end || clock.UtcNow > end.AddDays(_o.ReportDays))
            throw new BizException(409, "report_window_closed", $"只能在下課後 {_o.ReportDays} 天內回報。");
        if (await db.LessonReports.AnyAsync(r => r.LessonId == lessonId && r.Status != ReportStatus.Withdrawn, ct))
            throw new BizException(409, "already_reported", "這堂課已經回報過了。");
        if (reason?.Trim().Length > 300) throw new BizException(400, "validation", "原因不能超過 300 個字。");
        var report = new LessonReport { LessonId = lessonId, StudentId = studentId, Reason = reason?.Trim(), CreatedAtUtc = clock.UtcNow };
        db.LessonReports.Add(report);
        await db.SaveChangesAsync(ct);
        return report;
    }, ct);

    public Task<bool> WithdrawReportAsync(Guid studentId, Guid reportId, CancellationToken ct) => InTx(async () =>
    {
        var report = await db.LessonReports.SingleOrDefaultAsync(r => r.Id == reportId && r.StudentId == studentId, ct)
            ?? throw new BizException(404, "not_found", "找不到回報。");
        if (report.Status != ReportStatus.Open) throw new BizException(409, "already_handled", "這個回報已經處理過了。");
        report.Status = ReportStatus.Withdrawn;
        report.DecidedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    public Task<bool> DecideReportAsync(Guid reportId, bool approve, bool waiveFee, string? message, Guid teacherId, CancellationToken ct) => InTx(async () =>
    {
        var report = await db.LessonReports.Include(r => r.Lesson).ThenInclude(l => l.Student).SingleOrDefaultAsync(r => r.Id == reportId, ct)
            ?? throw new BizException(404, "not_found", "找不到回報。");
        if (report.Status != ReportStatus.Open) throw new BizException(409, "already_handled", "這個回報已經處理過了。");
        if (report.Lesson.Status != LessonStatus.Attended) throw new BizException(409, "not_attended", "課程狀態已變更，請重新整理。");
        if (!approve && (string.IsNullOrWhiteSpace(message) || message.Trim().Length > 300))
            throw new BizException(400, "validation", "請填寫 1–300 個字的婉拒原因。");
        report.Status = approve ? ReportStatus.Approved : ReportStatus.Declined;
        report.DecidedAtUtc = clock.UtcNow;
        report.FeeWaived = approve && waiveFee;
        report.DeclineReason = approve ? null : message!.Trim();
        if (approve)
        {
            report.Lesson.Status = LessonStatus.Cancelled;
            report.Lesson.CancelledByReport = true;
            report.Lesson.CancelledAtUtc = clock.UtcNow;
            report.Lesson.Refunded = true;
            report.Lesson.Student.Credits++;
            db.CreditLogs.Add(new CreditLog { StudentId = report.StudentId, Delta = 1, Reason = $"report:{report.Id}", ByUserId = teacherId, CreatedAtUtc = clock.UtcNow });
            if (!waiveFee) db.CancellationFees.Add(new CancellationFee { ReportId = report.Id, LessonId = report.LessonId, StudentId = report.StudentId, Amount = _o.CancelFee, CreatedAtUtc = clock.UtcNow });
        }
        var body = approve ? $"已退回 1 堂。{(waiveFee ? "這次不收取消費。" : $"取消費 NT$ {_o.CancelFee:N0} 將加在下次匯款金額。")}" : report.DeclineReason!;
        alerts.Add(report.StudentId, AlertKind.Report, approve ? "老師同意取消這堂課" : "老師無法取消這堂課", body, $"report:{report.Id}");
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);

    public Task<bool> UndoReportAsync(Guid reportId, Guid teacherId, CancellationToken ct) => InTx(async () =>
    {
        var report = await db.LessonReports.Include(r => r.Lesson).ThenInclude(l => l.Student).SingleOrDefaultAsync(r => r.Id == reportId, ct)
            ?? throw new BizException(404, "not_found", "找不到回報。");
        if (report.Status is not (ReportStatus.Approved or ReportStatus.Declined) || report.DecidedAtUtc is null || clock.UtcNow - report.DecidedAtUtc > _o.UndoWindow)
            throw new BizException(409, "undo_expired", "已超過可以復原的時間。");
        if (report.Status == ReportStatus.Approved)
        {
            var fee = await db.CancellationFees.SingleOrDefaultAsync(f => f.ReportId == reportId, ct);
            if (fee is { Status: not FeeStatus.Unpaid }) throw new BizException(409, "fee_billed", "取消費已列入收據，無法復原。");
            if (report.Lesson.Student.Credits < 1) throw new BizException(409, "credits_used", "退回的堂數已使用，無法復原。");
            if (report.Lesson.Status != LessonStatus.Cancelled || !report.Lesson.CancelledByReport)
                throw new BizException(409, "changed", "課程已有其他變動，無法復原。");
            report.Lesson.Student.Credits--;
            report.Lesson.Status = LessonStatus.Attended;
            report.Lesson.CancelledByReport = false;
            report.Lesson.CancelledAtUtc = null;
            report.Lesson.Refunded = false;
            if (fee is not null) db.CancellationFees.Remove(fee);
            db.CreditLogs.Add(new CreditLog { StudentId = report.StudentId, Delta = -1, Reason = $"undo-report:{report.Id}", ByUserId = teacherId, CreatedAtUtc = clock.UtcNow });
        }
        report.Status = ReportStatus.Open;
        report.DecidedAtUtc = null;
        report.DeclineReason = null;
        report.FeeWaived = false;
        await alerts.DropQueuedAsync($"report:{report.Id}", ct);
        await db.SaveChangesAsync(ct);
        return true;
    }, ct);
}
