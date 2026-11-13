using IrisStudio.Api.Data;

namespace IrisStudio.Api.Services;

/// <summary>
/// 學生列表 filters. One student is in at most one group, checked top to bottom
/// (the client mock in client/src/mocks/handlers.ts uses the same rules):
///   active  活躍       still has credits
///   noTrial 未上單堂課  approved, but never bought anything — not even the 單堂課
///   lapsed  未購買課程  credits used up, last lesson less than 3 months ago (or a lesson still booked) — likely to buy again
///   cold    冷漠       credits used up, no purchase and no lesson for more than 3 months
/// Pending applications and 停用 students get no group (null).
/// </summary>
public static class StudentSegments
{
    public static readonly TimeSpan Window = TimeSpan.FromDays(91);

    /// <param name="lastLessonUtc">start of the latest non-cancelled lesson that already began</param>
    /// <param name="hasUpcoming">a non-cancelled lesson still to come</param>
    /// <param name="lastPurchaseUtc">latest confirmed payment; null = never bought</param>
    public static string? Classify(User u, DateTime nowUtc, DateTime? lastLessonUtc, bool hasUpcoming, DateTime? lastPurchaseUtc)
    {
        if (u.Status != UserStatus.Active || u.Declined || u.DisabledAtUtc is not null) return null;
        if (u.Credits > 0) return "active";
        if (lastPurchaseUtc is null) return "noTrial";
        if (hasUpcoming || (lastLessonUtc is { } l && nowUtc - l < Window)) return "lapsed";
        return nowUtc - lastPurchaseUtc.Value > Window ? "cold" : "lapsed";
    }
}
