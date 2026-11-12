namespace IrisStudio.Api.Data;

public enum ReportStatus { Open, Approved, Declined, Withdrawn }
public enum FeeStatus { Unpaid, Billed, Paid }

public class LessonReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public Guid StudentId { get; set; }
    public string? Reason { get; set; }
    public ReportStatus Status { get; set; } = ReportStatus.Open;
    public string? DeclineReason { get; set; }
    public bool FeeWaived { get; set; }
    public CancellationFee? Fee { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DecidedAtUtc { get; set; }
}

public class CancellationFee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ReportId { get; set; }
    public Guid LessonId { get; set; }
    public Guid StudentId { get; set; }
    public int Amount { get; set; }
    public FeeStatus Status { get; set; }
    public Guid? PaymentId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public class PasswordHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string PasswordHash { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
