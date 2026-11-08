using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

/// <summary>
/// Auto 已上課 (decided 8 Nov 2026): a lesson that is still Booked after its END time becomes Attended.
/// Nobody has to tick attendance by hand. Cancelled lessons are never touched (they aren't Booked).
/// Open change requests / proposals on a lesson that already happened are closed as Declined.
/// Runs from AlertDispatcher about once a minute; the client mock runs the same rule (mocks/db.ts settleAttendance).
/// </summary>
public static class AttendanceSettler
{
    public static async Task<int> RunAsync(AppDbContext db, StudioClock clock, CancellationToken ct)
    {
        var today = clock.Today;
        // only today and earlier can have ended; the end-time check needs .NET (studio time zone), so filter in two steps
        var candidates = await db.Lessons.Where(l => l.Status == LessonStatus.Booked && l.Date <= today).ToListAsync(ct);
        var ended = candidates.Where(l => clock.ToUtc(l.Date, l.Time).AddMinutes(l.DurationMinutes) <= clock.UtcNow).ToList();
        if (ended.Count == 0) return 0;

        var ids = ended.Select(l => l.Id).ToList();
        foreach (var l in ended) l.Status = LessonStatus.Attended;
        await db.ChangeRequests.Where(c => ids.Contains(c.LessonId) && c.Status == ChangeStatus.Open)
            .ExecuteUpdateAsync(u => u.SetProperty(c => c.Status, ChangeStatus.Declined).SetProperty(c => c.DecidedAtUtc, clock.UtcNow), ct);
        await db.SaveChangesAsync(ct);
        return ended.Count;
    }
}
