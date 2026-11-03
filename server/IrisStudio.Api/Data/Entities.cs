namespace IrisStudio.Api.Data;

public enum Role { Student, Teacher }
public enum UserStatus { Pending, Active }
public enum LessonStatus { Booked, Attended, Cancelled }
public enum ChangeStatus { Open, Approved, Declined, Withdrawn }
public enum PaymentStatus { Pending, Confirmed, Rejected }
public enum AlertKind { Moved, Approved, Declined, Payment, Added, Welcome, Cancelled }

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
    public bool Declined { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    /// <summary>When Iris approved/declined the application (for the undo window).</summary>
    public DateTime? DecidedAtUtc { get; set; }
}

public class Lesson
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public User Student { get; set; } = null!;
    public DateOnly Date { get; set; }
    public TimeOnly Time { get; set; }
    public LessonStatus Status { get; set; } = LessonStatus.Booked;
    public DateTime? CancelledAtUtc { get; set; }
    public bool Refunded { get; set; }
    public bool CancelledByTeacher { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class ChangeRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public DateOnly ToDate { get; set; }
    public TimeOnly ToTime { get; set; }
    public string Reason { get; set; } = "";
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
    public string? RejectReason { get; set; }
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAtUtc { get; set; }
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
    public required string Contact { get; set; }
    public DateOnly PreferredDate { get; set; }
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
