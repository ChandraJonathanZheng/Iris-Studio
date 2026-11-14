using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<ChangeRequest> ChangeRequests => Set<ChangeRequest>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<Consult> Consults => Set<Consult>();
    public DbSet<BookingSettings> BookingSettings => Set<BookingSettings>();
    public DbSet<PricePackage> PricePackages => Set<PricePackage>();
    public DbSet<InstagramReel> InstagramReels => Set<InstagramReel>();
    public DbSet<WeeklyAvailability> WeeklyAvailability => Set<WeeklyAvailability>();
    public DbSet<DateOverride> DateOverrides => Set<DateOverride>();
    public DbSet<CreditLog> CreditLogs => Set<CreditLog>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();
    public DbSet<PrivacyRequest> PrivacyRequests => Set<PrivacyRequest>();
    public DbSet<LessonReport> LessonReports => Set<LessonReport>();
    public DbSet<CancellationFee> CancellationFees => Set<CancellationFee>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PasswordHistory> PasswordHistories => Set<PasswordHistory>();
    public DbSet<StudentNote> StudentNotes => Set<StudentNote>();
    public DbSet<LessonNote> LessonNotes => Set<LessonNote>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b)
    {
        // Enums stored as readable text ("Booked"), not numbers: safer when values are added later.
        b.Properties<Role>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<UserStatus>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<LessonStatus>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<LessonType>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<ChangeStatus>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<PaymentStatus>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<AlertKind>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<ChangeBy>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<TeacherStatus>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<ConsentKind>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<ConsentSource>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<PrivacyRequestType>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<ReportStatus>().HaveConversion<string>().HaveMaxLength(16);
        b.Properties<FeeStatus>().HaveConversion<string>().HaveMaxLength(16);
    }

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<ConsentRecord>(e =>
        {
            e.Property(x => x.Version).HasMaxLength(40);
            e.Property(x => x.Scope).HasMaxLength(100);
            e.Property(x => x.GuardianName).HasMaxLength(80);
            e.Property(x => x.GuardianRelation).HasMaxLength(20);
            e.Property(x => x.GuardianContact).HasMaxLength(120);
            e.HasIndex(x => new { x.UserId, x.Kind, x.CreatedAtUtc });
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); // proof outlives casual edits
        });
        m.Entity<PrivacyRequest>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Contact).HasMaxLength(120);
            e.Property(x => x.Detail).HasMaxLength(1000);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => new { x.Done, x.CreatedAtUtc });
        });
        m.Entity<User>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.LineId).HasMaxLength(30);
            e.Property(x => x.StatusLabel).HasMaxLength(12);
            e.Property(x => x.StatusMessage).HasMaxLength(60);
            e.HasIndex(x => x.Email).IsUnique().HasFilter("\"Email\" IS NOT NULL");
            e.HasIndex(x => x.LineUserId).IsUnique().HasFilter("\"LineUserId\" IS NOT NULL");
            e.HasIndex(x => x.StudentNo).IsUnique().HasFilter("\"StudentNo\" IS NOT NULL");
            e.Property(x => x.Gender).HasConversion<string>().HasMaxLength(8);
            e.ToTable(t => t.HasCheckConstraint("CK_User_GrowthLevel", "\"GrowthLevel\" BETWEEN 0 AND 10"));
            e.ToTable(t => t.HasCheckConstraint("CK_User_Credits", "\"Credits\" >= 0"));
        });

        m.Entity<Lesson>(e =>
        {
            // The real guard against double booking: only one BOOKED lesson per slot.
            e.HasIndex(x => new { x.Date, x.Time }).IsUnique().HasFilter("\"Status\" = 'Booked'").HasDatabaseName("UX_Lesson_Slot_Booked");
            e.HasIndex(x => new { x.StudentId, x.Date });
            e.HasOne(x => x.Student).WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
        });

        m.Entity<BookingSettings>(e => { e.HasKey(x => x.Id); e.Property(x => x.Id).ValueGeneratedNever(); });
        m.Entity<StudentNote>(e =>
        {
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.Text).HasMaxLength(1000);
            e.HasIndex(x => new { x.StudentId, x.CreatedAtUtc });
            e.ToTable(t => t.HasCheckConstraint("CK_StudentNotes_Text", "char_length(\"Text\") BETWEEN 1 AND 1000"));
        });
        m.Entity<LessonNote>(e =>
        {
            e.HasIndex(x => x.LessonId).IsUnique(); // one note per lesson: a new save replaces it
            e.HasIndex(x => x.StudentId);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.Html).HasMaxLength(5000);
            e.Property(x => x.FileName).HasMaxLength(200);
            e.HasOne(x => x.Lesson).WithOne().HasForeignKey<LessonNote>(x => x.LessonId).OnDelete(DeleteBehavior.Cascade);
            // exactly one payload, matching the kind
            e.ToTable(t => t.HasCheckConstraint("CK_LessonNotes_Payload",
                "(\"Kind\" = 'Text' AND \"Html\" IS NOT NULL AND \"FileName\" IS NULL) OR (\"Kind\" = 'Image' AND \"FileName\" IS NOT NULL AND \"Html\" IS NULL)"));
        });
        m.Entity<InstagramReel>(e => { e.Property(x => x.Title).HasMaxLength(60); e.Property(x => x.Url).HasMaxLength(300); e.HasQueryFilter(x => x.DeletedAt == null); e.HasIndex(x => x.SortOrder); });
        // one row per package size; at most one 單堂課 (partial unique index)
        m.Entity<PricePackage>(e => { e.HasIndex(x => x.Size).IsUnique(); e.HasIndex(x => x.IsTrial).IsUnique().HasFilter("\"IsTrial\""); });
        m.Entity<WeeklyAvailability>(e => { e.HasKey(x => x.Weekday); e.Property(x => x.Weekday).ValueGeneratedNever(); e.Property(x => x.Ranges).HasMaxLength(200); });
        m.Entity<DateOverride>(e => { e.HasKey(x => x.Date); e.Property(x => x.Ranges).HasMaxLength(200); e.Property(x => x.Note).HasMaxLength(60); });
        m.Entity<Consult>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.ContactType).HasMaxLength(10);
            e.Property(x => x.Contact).HasMaxLength(120);
            e.Property(x => x.PreferredTime).HasMaxLength(20);
            e.Property(x => x.Topic).HasMaxLength(1000);
        });
        m.Entity<ChangeRequest>(e =>
        {
            e.Property(x => x.Reason).HasMaxLength(300);
            // one open request per lesson
            e.HasIndex(x => x.LessonId).IsUnique().HasFilter("\"Status\" = 'Open'");
            e.HasOne(x => x.Lesson).WithMany().HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Cascade);
        });

        m.Entity<PasswordResetToken>(e =>
        {
            e.Property(x => x.TokenHash).HasMaxLength(64);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        m.Entity<PasswordHistory>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        m.Entity<LessonReport>(e =>
        {
            e.Property(x => x.Reason).HasMaxLength(200);
            e.Property(x => x.TeacherMessage).HasMaxLength(300);
            // one report per lesson (a withdrawn one doesn't count, so the student can report again)
            e.HasIndex(x => x.LessonId).IsUnique().HasFilter("\"Status\" <> 'Withdrawn'").HasDatabaseName("UX_LessonReport_Lesson");
            e.HasIndex(x => new { x.Status, x.CreatedAtUtc });
            e.HasOne(x => x.Lesson).WithMany().HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<CancellationFee>(e =>
        {
            e.HasIndex(x => x.ReportId).IsUnique();
            e.HasIndex(x => new { x.StudentId, x.Status });
            e.HasOne(x => x.Lesson).WithMany().HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<LessonReport>().WithMany().HasForeignKey(x => x.ReportId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Payment>().WithMany(p => p.Fees).HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.SetNull);
            e.ToTable(t => t.HasCheckConstraint("CK_Fee_Amount", "\"Amount\" > 0"));
        });

        m.Entity<Payment>(e =>
        {
            e.HasIndex(x => new { x.Status, x.UploadedAtUtc });
            e.HasOne(x => x.Student).WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
        });

        m.Entity<Alert>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            e.HasIndex(x => new { x.DeliveredAtUtc, x.SendAfterUtc });
            e.HasIndex(x => x.Source);
        });

        m.Entity<IdempotencyRecord>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.ResponseJson).HasColumnType("jsonb");
            e.HasIndex(x => x.CreatedAtUtc);
        });

        m.Entity<CreditLog>().HasIndex(x => x.StudentId);
    }
}
