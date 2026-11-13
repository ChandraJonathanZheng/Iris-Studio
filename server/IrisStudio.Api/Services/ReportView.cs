using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

/// <summary>
/// The 回報 side of a list of lessons, loaded in 2 queries (not one per lesson): the latest report that wasn't
/// withdrawn, its 取消費, and until when an Attended lesson can still be reported (<see cref="StudioOptions.ReportDays"/>).
/// </summary>
public class ReportView
{
    private readonly Dictionary<Guid, LessonReport> _reports;
    private readonly Dictionary<Guid, int> _fees;
    private readonly StudioClock _clock;
    private readonly int _days;

    private ReportView(Dictionary<Guid, LessonReport> reports, Dictionary<Guid, int> fees, StudioClock clock, int days)
    { _reports = reports; _fees = fees; _clock = clock; _days = days; }

    public static async Task<ReportView> LoadAsync(AppDbContext db, ICollection<Guid> lessonIds, StudioClock clock, StudioOptions o, CancellationToken ct)
    {
        var lessons = lessonIds.ToList(); // List.Contains → SQL "= ANY(@ids)"
        var reports = await db.LessonReports.AsNoTracking()
            .Where(r => lessons.Contains(r.LessonId) && r.Status != ReportStatus.Withdrawn).ToListAsync(ct);
        var ids = reports.Select(r => r.Id).ToList();
        var fees = await db.CancellationFees.AsNoTracking().Where(f => ids.Contains(f.ReportId)).ToDictionaryAsync(f => f.ReportId, f => f.Amount, ct);
        return new ReportView(reports.GroupBy(r => r.LessonId).ToDictionary(g => g.Key, g => g.OrderBy(r => r.CreatedAtUtc).Last()), fees, clock, o.ReportDays);
    }

    public LessonReportInfoDto? Info(Guid lessonId) => _reports.TryGetValue(lessonId, out var r)
        ? new LessonReportInfoDto(r.Id, r.Status.Camel(), r.Reason, r.TeacherMessage, _fees.TryGetValue(r.Id, out var f) ? f : null)
        : null;

    /// <summary>When the 回報 window closes, or null if this lesson can't be reported (not Attended, already reported, too old).</summary>
    public DateTime? Until(Lesson l)
    {
        if (l.Status != LessonStatus.Attended || _reports.ContainsKey(l.Id)) return null;
        var until = ReportDeadline(_clock, l, _days);
        return until > _clock.UtcNow ? DateTime.SpecifyKind(until, DateTimeKind.Utc) : null;
    }

    public static DateTime ReportDeadline(StudioClock clock, Lesson l, int days) =>
        clock.ToUtc(l.Date, l.Time).AddMinutes(l.DurationMinutes).AddDays(days);
}
