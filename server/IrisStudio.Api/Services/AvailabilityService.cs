using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

public readonly record struct TimeRange(TimeOnly Start, TimeOnly End);

/// <summary>
/// Iris's 可預約時段 → bookable slots. Same rules as client/src/lib/availability.ts (the mock API and the settings
/// page use that file), so what Iris previews is exactly what students can book:
///   • a special date wins over the weekly pattern (closed, or its own ranges);
///   • a lesson must FIT inside a range (start + length ≤ end);
///   • the next start is lesson length + break later (10:00–13:00, 60 + 30 → 10:00, 11:30);
///   • a slot is taken if any booked lesson overlaps it, break included on both sides.
/// </summary>
public class AvailabilityService(AppDbContext db)
{
    private Snapshot? _cache; // one read per request

    public sealed record Snapshot(BookingSettings Settings, IReadOnlyDictionary<int, WeeklyAvailability> Weekly, IReadOnlyDictionary<DateOnly, DateOverride> Overrides)
    {
        public IReadOnlyList<TimeRange> RangesFor(DateOnly date)
        {
            if (Overrides.TryGetValue(date, out var o)) return o.Closed ? [] : ParseRanges(o.Ranges);
            return Weekly.TryGetValue((int)date.DayOfWeek, out var w) && w.Enabled ? ParseRanges(w.Ranges) : [];
        }

        public bool CanFit(DateOnly date, TimeOnly time, int minutes) => SlotTimesFor(date).Contains(time)
            && RangesFor(date).Any(r => time >= r.Start && time.ToTimeSpan() + TimeSpan.FromMinutes(minutes) <= r.End.ToTimeSpan());

        public IReadOnlyList<TimeOnly> SlotTimesFor(DateOnly date) =>
            RangesFor(date).SelectMany(r => StartsInRange(r, Settings.LessonMinutes, Settings.GapMinutes)).Distinct().Order().ToArray();
    }

    public async Task<Snapshot> GetAsync(CancellationToken ct)
    {
        if (_cache is not null) return _cache;
        var settings = await db.BookingSettings.AsNoTracking().FirstOrDefaultAsync(ct) ?? new BookingSettings();
        var weekly = await db.WeeklyAvailability.AsNoTracking().ToDictionaryAsync(w => w.Weekday, ct);
        var overrides = await db.DateOverrides.AsNoTracking().ToDictionaryAsync(o => o.Date, ct);
        return _cache = new Snapshot(settings, weekly, overrides);
    }

    /// <summary>Call after saving changes so later reads in the same request see them.</summary>
    public void Invalidate() => _cache = null;

    // ---------- pure helpers ----------
    /// <summary>"09:30-12:30;14:00-20:30" → ranges. Stored as plain text: easy to read in the database, no JSON mapping needed.</summary>
    public static IReadOnlyList<TimeRange> ParseRanges(string s) =>
        s.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(p => p.Split('-'))
            .Where(p => p.Length == 2 && TimeOnly.TryParse(p[0], out _) && TimeOnly.TryParse(p[1], out _))
            .Select(p => new TimeRange(TimeOnly.Parse(p[0]), TimeOnly.Parse(p[1])))
            .OrderBy(r => r.Start).ToArray();

    public static string FormatRanges(IEnumerable<TimeRange> ranges) =>
        string.Join(';', ranges.OrderBy(r => r.Start).Select(r => $"{r.Start:HH\\:mm}-{r.End:HH\\:mm}"));

    public static IEnumerable<TimeOnly> StartsInRange(TimeRange r, int lessonMinutes, int gapMinutes)
    {
        var end = r.End.ToTimeSpan();
        for (var s = r.Start.ToTimeSpan(); s + TimeSpan.FromMinutes(lessonMinutes) <= end; s += TimeSpan.FromMinutes(lessonMinutes + gapMinutes))
            yield return TimeOnly.FromTimeSpan(s);
    }

    public static bool Overlaps(TimeOnly a, int aMinutes, TimeOnly b, int bMinutes, int gapMinutes)
    {
        var am = a.Hour * 60 + a.Minute;
        var bm = b.Hour * 60 + b.Minute;
        return am < bm + bMinutes + gapMinutes && bm < am + aMinutes + gapMinutes;
    }

    /// <summary>Problems with one day's ranges, worded for Iris (empty = fine). Mirrors rangeProblems() on the client.</summary>
    public static IReadOnlyList<string> RangeProblems(IReadOnlyList<TimeRange> ranges, int lessonMinutes)
    {
        var problems = new List<string>();
        var sorted = ranges.OrderBy(r => r.Start).ToArray();
        for (var i = 0; i < sorted.Length; i++)
        {
            var r = sorted[i];
            if (r.End <= r.Start) problems.Add($"{r.Start:HH\\:mm}–{r.End:HH\\:mm}：結束時間要晚於開始時間。");
            else if ((r.End - r.Start).TotalMinutes < lessonMinutes) problems.Add($"{r.Start:HH\\:mm}–{r.End:HH\\:mm} 比一堂課（{lessonMinutes} 分鐘）短，排不進課。");
            if (i > 0 && r.Start < sorted[i - 1].End) problems.Add($"{sorted[i - 1].Start:HH\\:mm}–{sorted[i - 1].End:HH\\:mm} 和 {r.Start:HH\\:mm}–{r.End:HH\\:mm} 重疊了。");
        }
        return problems;
    }

    public static readonly int[] LessonMinuteOptions = [30, 45, 60, 90, 120];
    public static readonly int[] GapMinuteOptions = [0, 10, 15, 30, 60];
    public static readonly int[] AdvanceDayOptions = [7, 14, 30, 60, 90];
}
