namespace IrisStudio.Api.Services;

/// <summary>Studio rules from appsettings.json → "Studio". Iris's business can change without code changes.</summary>
public class StudioOptions
{
    public string TimeZone { get; set; } = "Asia/Taipei";
    public string Room { get; set; } = "A 教室";
    public int CancelHours { get; set; } = 24;
    /// <summary>改時間 is only possible this many hours (or more) before the lesson starts.</summary>
    public int MoveHours { get; set; } = 12;
    public int UndoSeconds { get; set; } = 30;
    public int AlertDelaySeconds { get; set; } = 10;
    public PackageOption[] Packages { get; set; } = [];
    public BankOption Bank { get; set; } = new();
    public string TeacherName { get; set; } = "Iris";
    public string TeacherEmail { get; set; } = "";
    public string TeacherPassword { get; set; } = "";
    public string ReceiptsFolder { get; set; } = "App_Data/receipts";

    public TimeSpan UndoWindow => TimeSpan.FromSeconds(UndoSeconds);
}
/// <summary>Trial = the one-time 體驗課 (1 lesson) that only 體驗 students can buy, once.</summary>
public class PackageOption { public int Size { get; set; } public int Price { get; set; } public bool Trial { get; set; } }
public class BankOption { public string Name { get; set; } = ""; public string Account { get; set; } = ""; public string Holder { get; set; } = ""; }

/// <summary>
/// "What time is it at the studio?" Lessons are Taipei wall-clock times; the server may run in UTC.
/// Everything that compares with "now" goes through here (also makes tests able to fake the time).
/// </summary>
public class StudioClock(Microsoft.Extensions.Options.IOptions<StudioOptions> opt, TimeProvider time)
{
    private readonly TimeZoneInfo _tz = TimeZoneInfo.FindSystemTimeZoneById(opt.Value.TimeZone);

    public DateTime UtcNow => time.GetUtcNow().UtcDateTime;
    public DateTime LocalNow => TimeZoneInfo.ConvertTimeFromUtc(UtcNow, _tz);
    public DateOnly Today => DateOnly.FromDateTime(LocalNow);
    public TimeOnly NowTime => TimeOnly.FromDateTime(LocalNow);

    /// <summary>Lesson start as a UTC instant.</summary>
    public DateTime ToUtc(DateOnly date, TimeOnly t) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(date.ToDateTime(t), DateTimeKind.Unspecified), _tz);

    public bool IsPast(DateOnly date, TimeOnly t) => date < Today || (date == Today && t <= NowTime);
}
