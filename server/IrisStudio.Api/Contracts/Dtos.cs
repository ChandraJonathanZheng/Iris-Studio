using IrisStudio.Api.Data;
using IrisStudio.Api.Services;

namespace IrisStudio.Api.Contracts;

// JSON shapes the API sends/receives (camelCase). Mirrors client/src/lib/types.ts.
// Entities are never serialized directly: that would leak PasswordHash and allow mass assignment.

public record MeDto(Guid Id, string Name, string Role, string Status, string? Email, string? Phone, string? LineId, bool LineLinked,
    string? VoiceType, string? Goal, string? Grade, string? AvatarUrl, int Credits, int Booked, int Attended, int PackageSize, int UnreadAlerts);

public record ChangeInfoDto(Guid Id, string ToDate, string ToTime, string Reason);
public record LessonDto(Guid Id, string Date, string Time, string Status, string Room, Guid StudentId, string StudentName, ChangeInfoDto? Change);
public record DayDto(string Date, string State);
public record SlotDto(string Time, string State);
public record AlertDto(Guid Id, string Kind, string Title, string Body, DateTime CreatedAt, bool Read);
public record PaymentDto(Guid Id, Guid StudentId, string StudentName, int PackageSize, int Amount, string Status, DateTime UploadedAt,
    string? Note, string? RejectReason, string ReceiptUrl, string? Lqip);
public record NextLessonDto(string Date, string Time);
public record StudentSummaryDto(Guid Id, string Name, string Status, int Credits, int Booked, NextLessonDto? NextLesson, bool PaymentPending, string? LineId, string? VoiceType);
public record StudentDetailDto(Guid Id, string Name, string Status, int Credits, int Booked, NextLessonDto? NextLesson, bool PaymentPending, string? LineId, string? VoiceType,
    string? Email, string? Phone, string? Grade, string? Goal, int Attended, int PackageSize, LessonDto[] Upcoming, LessonDto[] Past, PaymentDto[] Payments);
public record ChangeRequestDto(Guid Id, Guid LessonId, Guid StudentId, string StudentName, string FromDate, string FromTime, string ToDate, string ToTime, string Reason, bool SlotFree, DateTime CreatedAt);
public record ApplicationDto(Guid Id, string Name, string? Email, DateTime CreatedAt);
public record RequestsDto(ChangeRequestDto[] Changes, ApplicationDto[] Applications);
public record CountsDto(int Receipts, int ReceiptsAmount, int Changes, int Applications, int Consults);
public record OverviewDto(LessonDto[] Today, CountsDto Counts, StudentSummaryDto[] OutOfQuota);
public record ConsultDto(Guid Id, string Name, string Contact, string PreferredDate, string Topic, DateTime CreatedAt, bool Contacted);
public record StudioDto(string[] Slots, int[] ClosedWeekdays, int CancelHours, PackageOption[] Packages, BankOption Bank);
public record BookResultDto(LessonDto Lesson, int CreditsLeft);
public record CancelResultDto(bool Refunded, int CreditsLeft, DateTime UndoUntil);
public record CreditsDto(int Credits);

// requests
public record LoginRequest(string Email, string Password);
public record BookRequest(string Date, string Time);
public record MoveRequest(string Date, string Time, string? Reason);
public record ReadRequest(Guid[] Ids, bool Read);
public record ProfileRequest(string? Name, string? Email, string? Phone, string? LineId, string? VoiceType, string? Goal);
public record ConsultRequest(string Name, string Contact, string PreferredDate, string? Topic);
public record MessageRequest(string? Message);
public record ReasonRequest(string? Reason);
public record DeltaRequest(int Delta);
public record ContactedRequest(bool Contacted);

public static class Map
{
    public static string D(DateOnly d) => d.ToString("yyyy-MM-dd");
    public static string T(TimeOnly t) => t.ToString("HH:mm");
    public static string Camel(this Enum e) { var s = e.ToString(); return char.ToLowerInvariant(s[0]) + s[1..]; }

    public static LessonDto Lesson(Lesson l, string room, ChangeRequest? open) => new(
        l.Id, D(l.Date), T(l.Time), l.Status.ToString(), room, l.StudentId, l.Student?.Name ?? "",
        open is null ? null : new ChangeInfoDto(open.Id, D(open.ToDate), T(open.ToTime), open.Reason));

    public static PaymentDto Payment(Payment p) => new(p.Id, p.StudentId, p.Student?.Name ?? "", p.PackageSize, p.Amount, p.Status.ToString(),
        DateTime.SpecifyKind(p.UploadedAtUtc, DateTimeKind.Utc), p.Note, p.RejectReason, $"/api/receipts/{p.Id}", p.Lqip);

    public static AlertDto Alert(Alert a) => new(a.Id, a.Kind.Camel(), a.Title, a.Body, DateTime.SpecifyKind(a.CreatedAtUtc, DateTimeKind.Utc), a.Read);

    public static bool TryParseSlot(string date, string time, out DateOnly d, out TimeOnly t)
    {
        t = default;
        return DateOnly.TryParseExact(date, "yyyy-MM-dd", out d) & TimeOnly.TryParseExact(time, "HH:mm", out t);
    }
}
