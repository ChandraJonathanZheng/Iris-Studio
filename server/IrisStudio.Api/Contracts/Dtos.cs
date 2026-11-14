using IrisStudio.Api.Data;
using IrisStudio.Api.Services;

namespace IrisStudio.Api.Contracts;

// JSON shapes the API sends/receives (camelCase). Mirrors client/src/lib/types.ts.
// Entities are never serialized directly: that would leak PasswordHash and allow mass assignment.

public record MeDto(Guid Id, string Name, string Role, string Status, string? Email, string? Phone, string? LineId, bool LineLinked,
    string? VoiceType, string? Goal, string? Grade, string? AvatarUrl, int Credits, int Booked, int Attended, int PackageSize, int UnreadAlerts,
    string ClassType, bool TrialAvailable, int Cancelled, int Reported);

public record ChangeInfoDto(Guid Id, string ToDate, string ToTime, string Reason, string By);
public record LessonDto(Guid Id, string Date, string Time, string Status, string Type, int Minutes, string Room, Guid StudentId, string StudentName, ChangeInfoDto? Change,
    LessonReportInfoDto? Report = null, DateTime? ReportUntil = null, string? NoteKind = null);
/// <summary>課堂筆記. Text → Html; Image → ImageUrl (+ blurred Lqip while it loads).</summary>
public record LessonNoteDto(Guid LessonId, Guid StudentId, string Kind, string? Html, string? ImageUrl, string? FileName, string? Lqip, int? Width, int? Height, DateTime UpdatedAt);
/// <summary>Where a past lesson's 回報 stands. Fee = 取消費 charged (null = none / waived).</summary>
public record LessonReportInfoDto(Guid Id, string Status, string? Reason, string? Message, int? Fee);
/// <summary>An open 回報 waiting for Iris.</summary>
public record LessonReportDto(Guid Id, Guid LessonId, Guid StudentId, string StudentName, string Date, string Time, int Minutes, string? Reason, DateTime CreatedAt);
public record FeeDto(Guid Id, Guid LessonId, string Date, string Time, int Amount, string Status, Guid? PaymentId);
public record PaymentFeeDto(Guid Id, int Amount, string Date, string Time);
public record ReportRequest(string? Reason);
public record DecideReportRequest(string? Message, bool WaiveFee = false);
public record DayDto(string Date, string State);
public record SlotDto(string Time, string State);
public record AlertDto(Guid Id, string Kind, string Title, string Body, DateTime CreatedAt, bool Read);
public record PaymentDto(Guid Id, Guid StudentId, string StudentName, int PackageSize, int Amount, string Status, DateTime UploadedAt,
    string? Note, string? RejectReason, string ReceiptUrl, string? Lqip, bool Trial, PaymentFeeDto[] Fees, string? StudentAvatarUrl);
public record NextLessonDto(string Date, string Time);
/// <param name="Gender">"M" | "F" | null</param>
/// <param name="Segment">學生列表 filter: active (活躍) | noTrial (未上單堂課) | lapsed (未購買課程) | cold (冷漠) | null (pending / 停用)</param>
public record StudentSummaryDto(Guid Id, string Name, string Status, string ClassType, int Credits, int Booked, NextLessonDto? NextLesson, bool PaymentPending, string? LineId, string? VoiceType, bool ConsultationCompleted,
    int StudentNo, string? Gender, DateTime JoinedAt, string? AvatarUrl, bool Disabled, string? Segment);
/// <param name="FirstLessonDate">最初上課 (YYYY-MM-DD)</param>
/// <param name="FirstPurchaseAt">首次購買課程 (first confirmed payment)</param>
/// <param name="TotalPaid">購買總額: sum of confirmed payments, NT$</param>
/// <param name="LoginMethod">"line" | "email"</param>
public record StudentDetailDto(Guid Id, string Name, string Status, string ClassType, int Credits, int Booked, NextLessonDto? NextLesson, bool PaymentPending, string? LineId, string? VoiceType,
    string? Email, string? Phone, string? Grade, string? Goal, int Attended, int PackageSize, LessonDto[] Upcoming, LessonDto[] Past, PaymentDto[] Payments,
    string? RemindChannel, DateTime? LastRemindedAt, StudentConsentDto Consent, bool ConsultationCompleted,
    int StudentNo, string? Gender, DateTime JoinedAt, string? AvatarUrl, bool Disabled, string? Segment,
    string? FirstLessonDate, DateTime? FirstPurchaseAt, int TotalPaid, string LoginMethod,
    string[] Skills, int GrowthLevel, int Missed, int TotalLessons, Guid[] MovedLessonIds, string? CoverUrl = null);
/// <param name="Missed">缺課: cancelled late (no refund) or through 回報</param>
public record SkillsRequest(string[] Skills);
public record GrowthRequest(int Level);
public record StudentStatusRequest(bool Disabled);
public record StudentBasicsRequest(string? VoiceType, string? Grade);
public record StudentNoteRequest(string Kind, string Text);
public record StudentNoteDto(Guid Id, Guid StudentId, string Kind, string Text, DateTime CreatedAt);
public record RemindRequest(string Message);
public record RemindResult(Guid Id, string Channel);
public record ChangeRequestDto(Guid Id, Guid LessonId, Guid StudentId, string StudentName, string FromDate, string FromTime, string ToDate, string ToTime, string Reason, bool SlotFree, DateTime CreatedAt);
public record ApplicationDto(Guid Id, string Name, string? Email, DateTime CreatedAt);
public record RequestsDto(ChangeRequestDto[] Changes, ApplicationDto[] Applications, ProposalDto[] Proposals, LessonReportDto[] Reports);
/// <summary>A time change Iris proposed: open ones wait for the student, answered ones stay visible for 7 days.</summary>
public record ProposalDto(Guid Id, Guid LessonId, Guid StudentId, string StudentName, string FromDate, string FromTime, string ToDate, string ToTime,
    string Message, string Status, DateTime CreatedAt, DateTime? DecidedAt);
public record ProposeRequest(string Date, string Time, string? Message);
public record CountsDto(int Receipts, int ReceiptsAmount, int Changes, int Reports, int Applications, int Consults);
public record OverviewDto(LessonDto[] Today, CountsDto Counts, StudentSummaryDto[] OutOfQuota);
public record ConsultDto(Guid Id, string Name, string ContactType, string Contact, string PreferredTime, string Topic, DateTime CreatedAt, bool Contacted);
public record StudioDto(int LessonMinutes, int CancelHours, int MoveHours, int ReportDays, int CancelFee, PackageOption[] Packages, BankOption Bank, TeacherPublicDto Teacher);
/// <summary>What students may see about Iris. LineId only when she chose to show it.</summary>
public record TeacherPublicDto(string Name, string? AvatarUrl, string Status, string? StatusLabel, string? StatusMessage, string? LineId);
public record TeacherProfileDto(string Name, string? Email, bool EmailVerified, bool LineLinked, bool HasPassword, string? LineId, bool LineIdPublic,
    string? AvatarUrl, string Status, string? StatusLabel, string? StatusMessage);
public record TeacherProfileRequest(string Name, string? LineId, bool LineIdPublic, string Status, string? StatusLabel, string? StatusMessage);
public record ChangeEmailRequest(string Email, string Password);
public record BookResultDto(LessonDto Lesson, int CreditsLeft);
public record CancelResultDto(bool Refunded, int CreditsLeft, DateTime UndoUntil);
public record CreditsDto(int Credits);

// requests
public record LoginRequest(string Email, string Password);
public record ForgotPasswordRequest(string? Email);
public record ResetCheckRequest(string? Token);
public record ResetPasswordRequest(string? Token, string? Password);
public record RegisterRequest(string Name, string Email, string? Phone, string Password, ConsentInput? Consents);
public record GuardianInput(string Name, string Relation, string Contact, bool Agreed);
public record ConsentInput(string Version, bool Terms, bool Media, bool Marketing, bool Minor, GuardianInput? Guardian);
public record ConsentStateDto(bool Granted, DateTime? At);
public record ConsentRecordDto(string Kind, bool Granted, string Version, DateTime At, string Source);
public record MyConsentsDto(ConsentStateDto Media, ConsentStateDto Marketing, bool Minor, string? GuardianName, ConsentRecordDto[] History);
public record StudentConsentDto(bool Media, DateTime? MediaAt, bool MediaWithdrawn, bool Marketing, bool Minor);
public record PrivacyRequestInput(string Name, string Contact, string Type, string? Detail);
public record PrivacyRequestDto(Guid Id, string Name, string Contact, string Type, string Detail, string Status, DateTime CreatedAt, DateTime DueAt, DateTime? HandledAt, string? Note);
public record NoteRequest(string Note);
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
public record ConsultationRequest(bool ConsultationCompleted);
/// <summary>課程方案 editor: the whole list is replaced in one go.</summary>
public record PackagesRequest(PackageOption[] Packages);

public static class Map
{
    public static string D(DateOnly d) => d.ToString("yyyy-MM-dd");
    public static string T(TimeOnly t) => t.ToString("HH:mm");
    public static string Camel(this Enum e) { var s = e.ToString(); return char.ToLowerInvariant(s[0]) + s[1..]; }

    public static LessonDto Lesson(Lesson l, string room, ChangeRequest? open, ReportView? report = null) => new(
        l.Id, D(l.Date), T(l.Time), l.Status.ToString(), l.Type.Camel(), l.DurationMinutes, room, l.StudentId, l.Student?.Name ?? "",
        open is null ? null : new ChangeInfoDto(open.Id, D(open.ToDate), T(open.ToTime), open.Reason, open.ProposedBy.Camel()),
        report?.Info(l.Id), report?.Until(l));

    /// <summary>Payment + the 取消費 billed on it. Load with <c>.Include(p => p.Fees).ThenInclude(f => f.Lesson)</c> to list them.</summary>
    public static PaymentDto Payment(Payment p) => new(p.Id, p.StudentId, p.Student?.Name ?? "", p.PackageSize, p.Amount, p.Status.ToString(),
        DateTime.SpecifyKind(p.UploadedAtUtc, DateTimeKind.Utc), p.Note, p.RejectReason, $"/api/receipts/{p.Id}", p.Lqip, p.IsTrial,
        p.Fees.Where(f => f.Lesson is not null).Select(f => new PaymentFeeDto(f.Id, f.Amount, D(f.Lesson.Date), T(f.Lesson.Time))).ToArray(),
        p.Student?.AvatarUrl);

    public static FeeDto Fee(CancellationFee f) => new(f.Id, f.LessonId, D(f.Lesson.Date), T(f.Lesson.Time), f.Amount, f.Status.Camel(), f.PaymentId);

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
