using IrisStudio.Api.Data;
using IrisStudio.Api.Services;

namespace IrisStudio.Api.Contracts;

// JSON shapes the API sends/receives (camelCase). Mirrors client/src/lib/types.ts.
// Entities are never serialized directly: that would leak PasswordHash and allow mass assignment.

public record MeDto(Guid Id, string Name, string Role, string Status, string? Email, string? Phone, string? LineId, bool LineLinked,
    string? VoiceType, string? Goal, string? Grade, string? AvatarUrl, int Credits, int Booked, int Attended, int PackageSize, int UnreadAlerts,
    string ClassType, bool TrialAvailable);

public record ChangeInfoDto(Guid Id, string ToDate, string ToTime, string Reason, string By);
public record LessonDto(Guid Id, string Date, string Time, string Status, string Type, int Minutes, string Room, Guid StudentId, string StudentName, ChangeInfoDto? Change);
public record DayDto(string Date, string State);
public record SlotDto(string Time, string State);
public record AlertDto(Guid Id, string Kind, string Title, string Body, DateTime CreatedAt, bool Read);
public record PaymentDto(Guid Id, Guid StudentId, string StudentName, int PackageSize, int Amount, string Status, DateTime UploadedAt,
    string? Note, string? RejectReason, string ReceiptUrl, string? Lqip, bool Trial);
public record NextLessonDto(string Date, string Time);
public record StudentSummaryDto(Guid Id, string Name, string Status, string ClassType, int Credits, int Booked, NextLessonDto? NextLesson, bool PaymentPending, string? LineId, string? VoiceType);
public record StudentDetailDto(Guid Id, string Name, string Status, string ClassType, int Credits, int Booked, NextLessonDto? NextLesson, bool PaymentPending, string? LineId, string? VoiceType,
    string? Email, string? Phone, string? Grade, string? Goal, int Attended, int PackageSize, LessonDto[] Upcoming, LessonDto[] Past, PaymentDto[] Payments,
    string? RemindChannel, DateTime? LastRemindedAt);
public record RemindRequest(string Message);
public record RemindResult(Guid Id, string Channel);
public record ChangeRequestDto(Guid Id, Guid LessonId, Guid StudentId, string StudentName, string FromDate, string FromTime, string ToDate, string ToTime, string Reason, bool SlotFree, DateTime CreatedAt);
public record ApplicationDto(Guid Id, string Name, string? Email, DateTime CreatedAt);
public record RequestsDto(ChangeRequestDto[] Changes, ApplicationDto[] Applications, ProposalDto[] Proposals);
/// <summary>A time change Iris proposed: open ones wait for the student, answered ones stay visible for 7 days.</summary>
public record ProposalDto(Guid Id, Guid LessonId, Guid StudentId, string StudentName, string FromDate, string FromTime, string ToDate, string ToTime,
    string Message, string Status, DateTime CreatedAt, DateTime? DecidedAt);
public record ProposeRequest(string Date, string Time, string? Message);
public record CountsDto(int Receipts, int ReceiptsAmount, int Changes, int Applications, int Consults);
public record OverviewDto(LessonDto[] Today, CountsDto Counts, StudentSummaryDto[] OutOfQuota);
public record ConsultDto(Guid Id, string Name, string ContactType, string Contact, string PreferredTime, string Topic, DateTime CreatedAt, bool Contacted);
public record StudioDto(int LessonMinutes, int CancelHours, int MoveHours, PackageOption[] Packages, BankOption Bank);
public record BookResultDto(LessonDto Lesson, int CreditsLeft);
public record CancelResultDto(bool Refunded, int CreditsLeft, DateTime UndoUntil);
public record CreditsDto(int Credits);

// requests
public record LoginRequest(string Email, string Password);
public record RegisterRequest(string Name, string Email, string? Phone, string Password);
public record BookRequest(string Date, string Time);
public record MoveRequest(string Date, string Time, string? Reason);
public record ReadRequest(Guid[] Ids, bool Read);
public record ProfileRequest(string? Name, string? Email, string? Phone, string? LineId, string? VoiceType, string? Goal);
public record ConsultRequest(string Name, string ContactType, string Contact, string PreferredTime, string? Topic);
public record MessageRequest(string? Message);
public record ReasonRequest(string? Reason);
/// <summary>Manual credit change. Reason is required by the UI (補課 / 贈送 / 修正錯誤 / 其他 + note) and kept in the audit log.</summary>
public record DeltaRequest(int Delta, string? Reason = null);
public record ContactedRequest(bool Contacted);
public record ClassTypeRequest(string ClassType);

public static class Map
{
    public static string D(DateOnly d) => d.ToString("yyyy-MM-dd");
    public static string T(TimeOnly t) => t.ToString("HH:mm");
    public static string Camel(this Enum e) { var s = e.ToString(); return char.ToLowerInvariant(s[0]) + s[1..]; }

    public static LessonDto Lesson(Lesson l, string room, ChangeRequest? open) => new(
        l.Id, D(l.Date), T(l.Time), l.Status.ToString(), l.Type.Camel(), l.DurationMinutes, room, l.StudentId, l.Student?.Name ?? "",
        open is null ? null : new ChangeInfoDto(open.Id, D(open.ToDate), T(open.ToTime), open.Reason, open.ProposedBy.Camel()));

    public static PaymentDto Payment(Payment p) => new(p.Id, p.StudentId, p.Student?.Name ?? "", p.PackageSize, p.Amount, p.Status.ToString(),
        DateTime.SpecifyKind(p.UploadedAtUtc, DateTimeKind.Utc), p.Note, p.RejectReason, $"/api/receipts/{p.Id}", p.Lqip, p.IsTrial);

    public static AlertDto Alert(Alert a) => new(a.Id, a.Kind.Camel(), a.Title, a.Body, DateTime.SpecifyKind(a.CreatedAtUtc, DateTimeKind.Utc), a.Read);

    public static bool TryParseSlot(string date, string time, out DateOnly d, out TimeOnly t)
    {
        t = default;
        return DateOnly.TryParseExact(date, "yyyy-MM-dd", out d) & TimeOnly.TryParseExact(time, "HH:mm", out t);
    }
}

// ---------- 可預約時段 ----------
public record TimeRangeDto(string Start, string End);
public record BookingSettingsDto(int LessonMinutes, int GapMinutes, int AdvanceDays);
public record WeeklyDayDto(int Weekday, bool Enabled, TimeRangeDto[] Ranges);
public record DateOverrideDto(string Date, bool Closed, TimeRangeDto[] Ranges, string Note);
public record AvailabilityDto(BookingSettingsDto Settings, WeeklyDayDto[] Weekly, DateOverrideDto[] Overrides);
public record OverrideRequest(bool Closed, TimeRangeDto[]? Ranges, string? Note);
