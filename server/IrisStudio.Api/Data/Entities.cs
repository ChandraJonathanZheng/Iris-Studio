namespace IrisStudio.Api.Data;

public enum Role { Student, Teacher }
public enum UserStatus { Pending, Active }
public enum LessonStatus { Booked, Attended, Cancelled }
/// <summary>private = 一對一, group = 團體課, trial = 體驗課</summary>
public enum LessonType { Private, Group, Trial }
public enum ChangeStatus { Open, Approved, Declined, Withdrawn }
public enum PaymentStatus { Pending, Confirmed, Rejected }
/// <summary>Stored as text (see AppDbContext.ConfigureConventions). Reminder = Iris's manual 通知學生繳學費.</summary>
public enum AlertKind { Moved, Approved, Declined, Payment, Added, Welcome, Cancelled, Reminder, Proposal, Report, Homework }
public enum Gender { Male, Female }
/// <summary>給筆記 (only Iris sees it) or 給作業 (the student is notified and sees it).</summary>
public enum StudentNoteKind { Note, Homework }
/// <summary>回報 of a past lesson. Declined is final; Withdrawn lets the student report again.</summary>
public enum ReportStatus { Open, Approved, Declined, Withdrawn }
/// <summary>取消費: Unpaid → Billed (on the next receipt) → Paid (receipt confirmed).</summary>
public enum FeeStatus { Unpaid, Billed, Paid }
/// <summary>Who asked for the time change: the student (Iris approves) or Iris (the student accepts).</summary>
public enum ChangeBy { Student, Teacher }

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public Role Role { get; set; } = Role.Student;
    public UserStatus Status { get; set; } = UserStatus.Pending;
    public string? Email { get; set; }
    public string? PasswordHash { get; set; }
    public string? Phone { get; set; }
    /// <summary>LINE's stable user id ("sub" from LINE Login). Null for email-only accounts.</summary>
    public string? LineUserId { get; set; }
    /// <summary>The LINE ID the student types in their profile (for Iris to search by).</summary>
    public string? LineId { get; set; }
    public string? VoiceType { get; set; }
    public string? Goal { get; set; }
    public string? Grade { get; set; }
    public string? AvatarUrl { get; set; }
    /// <summary>Sessions not yet booked. DB check keeps it ≥ 0.</summary>
    public int Credits { get; set; }
    public int PackageSize { get; set; }
    /// <summary>Student class type set by Iris: Private = 一對一, Group = 團體課, Trial = 體驗課 (same labels as lessons). New sign-ups start as Trial.</summary>
    public LessonType ClassType { get; set; } = LessonType.Trial;
    /// <summary>Iris ticked 已完成諮詢／面談 — unlocks one 單堂課 purchase.</summary>
    public bool ConsultationCompleted { get; set; }
    public bool Declined { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // ---- 學生列表 columns ----
    /// <summary>學號 shown as ID in the 學生列表 (1001, 1002 …). Assigned when Iris approves the application. Unique.</summary>
    public int? StudentNo { get; set; }
    public Gender? Gender { get; set; }
    /// <summary>When the student started lessons (上課資年). Set on approval; Iris can correct it for students who joined before the app.</summary>
    public DateOnly? JoinedOn { get; set; }
    /// <summary>停用: kept with all history, but can't book new lessons. Null = active.</summary>
    public DateTime? DisabledAtUtc { get; set; }
    /// <summary>When Iris approved/declined the application (for the undo window).</summary>
    public DateTime? DecidedAtUtc { get; set; }

    // ---- teacher profile (教師個人資料). Only used on the teacher account. ----
    /// <summary>Login email is confirmed. Changing it sets this back to false until the link is clicked.</summary>
    public bool EmailVerified { get; set; }
    /// <summary>Show LineId (the contact ID) to students. Separate from LineUserId, which is only for signing in.</summary>
    public bool LineIdPublic { get; set; }
    public TeacherStatus TeacherStatus { get; set; } = TeacherStatus.Normal;
    /// <summary>Own label when TeacherStatus = Custom (e.g. 比賽準備中).</summary>
    public string? StatusLabel { get; set; }
    /// <summary>Short note students see, e.g. 放假中，明天回覆.</summary>
    public string? StatusMessage { get; set; }
}

/// <summary>What students see about Iris right now: 正常上課 / 放假中 / 暫停接新學生 / 自訂.</summary>
public enum TeacherStatus { Normal, Vacation, NoNewStudents, Custom }

public class Lesson
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public User Student { get; set; } = null!;
    public DateOnly Date { get; set; }
    public TimeOnly Time { get; set; }
    public LessonStatus Status { get; set; } = LessonStatus.Booked;
    public LessonType Type { get; set; } = LessonType.Private;
    public int DurationMinutes { get; set; } = 60;
    public DateTime? CancelledAtUtc { get; set; }
    public bool Refunded { get; set; }
    public bool CancelledByTeacher { get; set; }
    /// <summary>Cancelled afterwards because Iris approved the student's 回報 (the lesson had already passed).</summary>
    public bool CancelledByReport { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// 回報: the student asks Iris to cancel a lesson that already passed (attendance is automatic, so a lesson they
/// missed still used a credit). Approved → lesson Cancelled, +1 credit, and a <see cref="CancellationFee"/> (unless waived).
/// </summary>
public class LessonReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public Guid StudentId { get; set; }
    public string? Reason { get; set; }
    public ReportStatus Status { get; set; } = ReportStatus.Open;
    /// <summary>Iris's reason when she declines (the student sees it).</summary>
    public string? TeacherMessage { get; set; }
    public bool FeeWaived { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAtUtc { get; set; }
}

/// <summary>
/// 取消費 from an approved 回報. There is no payment gateway, so it is "charged" by adding it to the amount of the
/// student's next receipt (<see cref="PaymentId"/>), and paid when Iris confirms that receipt.
/// </summary>
public class CancellationFee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public Guid ReportId { get; set; }
    public int Amount { get; set; }
    public FeeStatus Status { get; set; } = FeeStatus.Unpaid;
    /// <summary>The receipt this fee is billed on (null while Unpaid).</summary>
    public Guid? PaymentId { get; set; }
    /// <summary>Last receipt it was on — lets "undo reject" put it back on that receipt.</summary>
    public Guid? LastPaymentId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class ChangeRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public DateOnly ToDate { get; set; }
    public TimeOnly ToTime { get; set; }
    /// <summary>Student's reason, or Iris's message when she proposes.</summary>
    public string Reason { get; set; } = "";
    /// <summary>Student = 學生申請 (Iris decides). Teacher = 老師提議 (the student decides). Iris never moves a lesson without consent.</summary>
    public ChangeBy ProposedBy { get; set; } = ChangeBy.Student;
    public ChangeStatus Status { get; set; } = ChangeStatus.Open;
    /// <summary>The lesson's slot before approval, so an approval can be undone.</summary>
    public DateOnly? PrevDate { get; set; }
    public TimeOnly? PrevTime { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAtUtc { get; set; }
}

public class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public User Student { get; set; } = null!;
    public int PackageSize { get; set; }
    public int Amount { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public required string ReceiptPath { get; set; }
    public required string ContentType { get; set; }
    /// <summary>Tiny blurred preview (data: URL, ~300 bytes) made at upload, shown while the receipt loads.</summary>
    public string? Lqip { get; set; }
    public string? Note { get; set; }
    /// <summary>Bought the 體驗課 package (only once per student).</summary>
    public bool IsTrial { get; set; }
    public string? RejectReason { get; set; }
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAtUtc { get; set; }
    /// <summary>取消費 billed on this receipt. <see cref="Amount"/> already includes them.</summary>
    public List<CancellationFee> Fees { get; set; } = [];
}

/// <summary>
/// In-app alert + outbox. SendAfterUtc delays delivery a few seconds so Iris can undo a decision
/// before the student ever sees it. AlertDispatcher pushes due alerts to LINE/email once configured.
/// </summary>
public class Alert
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AlertKind Kind { get; set; }
    public required string Title { get; set; }
    public required string Body { get; set; }
    public bool Read { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime SendAfterUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeliveredAtUtc { get; set; }
    /// <summary>What caused it, e.g. "change:{id}", so undo can delete a queued alert.</summary>
    public string? Source { get; set; }
}

public class Consult
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    /// <summary>"line" or "email" — tells Iris how to read <see cref="Contact"/>.</summary>
    public required string ContactType { get; set; }
    public required string Contact { get; set; }
    /// <summary>Rough window: weekdayDay / weekdayEvening / weekend / any.</summary>
    public required string PreferredTime { get; set; }
    public string Topic { get; set; } = "";
    public bool Contacted { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Audit trail for every credit change that isn't a booking (Iris's manual +/−, payments).</summary>
public class CreditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public int Delta { get; set; }
    public required string Reason { get; set; }
    public Guid? ByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// One row per Idempotency-Key. Written in the SAME transaction as the action, so either both the booking
/// and this row exist, or neither does. A retry with the same key replays the saved response.
/// </summary>
public class IdempotencyRecord
{
    public Guid Key { get; set; }
    public Guid UserId { get; set; }
    public required string Endpoint { get; set; }
    public required string RequestHash { get; set; }
    public int? StatusCode { get; set; }
    public string? ResponseJson { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Iris's 預約設定 — a single row (Id = 1).</summary>
/// <summary>Instagram Reel shown on the website (精彩片段). Iris manages them in 更多 › IG Reels; max 8 live.
/// Soft delete: DeletedAt set → hidden everywhere, row kept (undo / audit).</summary>
public class InstagramReel
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int SortOrder { get; set; }
    public required string Title { get; set; }
    public required string Url { get; set; }
    public string? CoverPath { get; set; }
    public string? CoverLqip { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }
}

/// <summary>課程方案 row. Iris edits these on 更多 › 課程方案; the first time, rows are seeded from appsettings Studio:Packages.</summary>
public class PricePackage
{
    public int Id { get; set; }
    public int Size { get; set; }
    public int Price { get; set; }
    public bool IsTrial { get; set; }
    public int SortOrder { get; set; }
}

public class BookingSettings
{
    public int Id { get; set; } = 1;
    public int LessonMinutes { get; set; } = 60;
    public int GapMinutes { get; set; } = 30;
    /// <summary>可提前預約: students can book up to this many days ahead.</summary>
    public int AdvanceDays { get; set; } = 30;
}

/// <summary>每週時段: one row per weekday (0 = Sunday). Ranges as "09:30-12:30;14:00-20:30".</summary>
public class WeeklyAvailability
{
    public int Weekday { get; set; }
    public bool Enabled { get; set; }
    public string Ranges { get; set; } = "";
}

/// <summary>特殊日期: replaces the weekly pattern for one date — closed all day, or its own ranges.</summary>
public class DateOverride
{
    public DateOnly Date { get; set; }
    public bool Closed { get; set; }
    public string Ranges { get; set; } = "";
    public string Note { get; set; } = "";
}

/// <summary>What a consent record is about. Terms/Privacy = read & agreed at sign-up; Media/Marketing = optional; Guardian = a minor's legal representative agreed.</summary>
public enum ConsentKind { Terms, Privacy, Media, Marketing, Guardian }
public enum ConsentSource { Register, Profile, Request }

/// <summary>
/// Append-only consent log (never updated, never deleted with the account's normal edits): each change is a new row.
/// The latest row per (user, kind) is the current state; the rows before it prove what was agreed, when, to which version.
/// </summary>
public class ConsentRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ConsentKind Kind { get; set; }
    public bool Granted { get; set; }
    /// <summary>Version of the text the person saw (lib/legal.ts CONSENT_VERSION).</summary>
    public required string Version { get; set; }
    /// <summary>What it covers, e.g. "photo,video,voice" or "line,email".</summary>
    public string Scope { get; set; } = "";
    public ConsentSource Source { get; set; }
    public string? GuardianName { get; set; }
    public string? GuardianRelation { get; set; }
    public string? GuardianContact { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>個資法 §3 rights (+ withdrawing an optional consent). §13: 15 days (Access/Copy) or 30 days (others) to decide.</summary>
public enum PrivacyRequestType { Access, Copy, Correct, Stop, Delete, Withdraw }

public class PrivacyRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Contact { get; set; }
    public PrivacyRequestType Type { get; set; }
    public string Detail { get; set; } = "";
    public bool Done { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? HandledAtUtc { get; set; }
    public static int DaysFor(PrivacyRequestType t) => t is PrivacyRequestType.Access or PrivacyRequestType.Copy ? 15 : 30;
}

/// <summary>
/// One 忘記密碼 link. Only the SHA-256 of the token is stored, so a database leak can't be turned into working links.
/// Valid for 30 minutes, once; asking again replaces older links.
/// </summary>
public class PasswordResetToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string TokenHash { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>The user's last 3 password hashes (current one included): a new password may not be any of them.</summary>
public class PasswordHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string PasswordHash { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>給筆記 / 給作業 for one student (學生列表 ⋯ menu).</summary>
public class StudentNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public User Student { get; set; } = null!;
    public StudentNoteKind Kind { get; set; }
    /// <summary>1–1000 characters.</summary>
    public required string Text { get; set; }
    public Guid ByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
