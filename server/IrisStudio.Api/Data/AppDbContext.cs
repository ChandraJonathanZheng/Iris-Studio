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
    public DbSet<WeeklyAvailability> WeeklyAvailability => Set<WeeklyAvailability>();
    public DbSet<DateOverride> DateOverrides => Set<DateOverride>();
    public DbSet<CreditLog> CreditLogs => Set<CreditLog>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();
    public DbSet<PrivacyRequest> PrivacyRequests => Set<PrivacyRequest>();

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
