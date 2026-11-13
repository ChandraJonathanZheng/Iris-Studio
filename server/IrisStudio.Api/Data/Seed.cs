using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Data;

public static class Seed
{
    /// <summary>Applies migrations, makes sure Iris's account exists, and (Development only) adds demo students.</summary>
    public static async Task RunAsync(IServiceProvider sp, bool demo)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var o = scope.ServiceProvider.GetRequiredService<IOptions<StudioOptions>>().Value;
        var hasher = scope.ServiceProvider.GetRequiredService<PasswordHasher<User>>();
        var clock = scope.ServiceProvider.GetRequiredService<StudioClock>();
        await db.Database.MigrateAsync();

        var email = o.TeacherEmail.Trim().ToLowerInvariant();
        if (!await db.Users.AnyAsync(u => u.Role == Role.Teacher))
        {
            var t = new User { Name = o.TeacherName, Role = Role.Teacher, Status = UserStatus.Active, Email = email, EmailVerified = true }; // set by the owner in config
            t.PasswordHash = hasher.HashPassword(t, o.TeacherPassword);
            db.Users.Add(t);
        }

        // Default 可預約時段 (Iris edits it in the app): Mon–Sat 09:30–12:30 + 14:00–20:30, Sunday off; 60 min + 30 min break, 30 days ahead.
        if (!await db.WeeklyAvailability.AnyAsync())
        {
            db.BookingSettings.Add(new BookingSettings());
            for (var w = 0; w < 7; w++)
                db.WeeklyAvailability.Add(new WeeklyAvailability { Weekday = w, Enabled = w != 0, Ranges = w == 0 ? "" : "09:30-12:30;14:00-20:30" });
            await db.SaveChangesAsync();
        }

        // 精彩片段: Iris's 8 Reels (titles are placeholders; she renames them and uploads covers in 更多 › IG Reels)
        if (!await db.InstagramReels.IgnoreQueryFilters().AnyAsync())
        {
            string[] codes = ["Dc_LQRduKf0", "DZXNjLMRvry", "DQ6667yk1NP", "DNDn0AkxO9b", "DEVDWcaSplt", "C9mI7YjxZ4a", "C5fhPr9RICt", "DXbgjVJyTd8"];
            for (var i = 0; i < codes.Length; i++)
                db.InstagramReels.Add(new InstagramReel { SortOrder = i + 1, Title = $"精彩片段 {i + 1}", Url = $"https://www.instagram.com/reel/{codes[i]}/" });
            await db.SaveChangesAsync();
        }

        if (demo && !await db.Users.AnyAsync(u => u.Role == Role.Student))
        {
            // gender + months since they started (上課資年) for the 學生列表 demo
            (string name, string mail, int credits, int pkg, string voice, Gender g, int months)[] people =
            [
                ("王小明", "xiaoming", 2, 4, "男高音", Gender.Male, 14), ("林佳穎", "jiaying", 3, 4, "女高音", Gender.Female, 9), ("陳雅婷", "yating", 1, 4, "女中音", Gender.Female, 22),
                ("張家豪", "jiahao", 5, 8, "男中音", Gender.Male, 5), ("李思涵", "sihan", 0, 4, "女高音", Gender.Female, 3),
            ];
            var no = 1000;
            var students = people.Select(p =>
            {
                var u = new User { Name = p.name, Email = $"{p.mail}@demo.local", Status = UserStatus.Active, ClassType = p.mail == "yating" ? LessonType.Group : LessonType.Private, Credits = p.credits, PackageSize = p.pkg, VoiceType = p.voice, LineId = p.mail, Grade = "Grade 2",
                    StudentNo = ++no, Gender = p.g, JoinedOn = clock.Today.AddMonths(-p.months) };
                u.PasswordHash = hasher.HashPassword(u, "demo1234");
                return u;
            }).ToList();
            var pending = new User { Name = "吳詠晴", Email = "yongqing@demo.local", Gender = Gender.Female };
            pending.PasswordHash = hasher.HashPassword(pending, "demo1234");
            db.Users.AddRange(students);
            db.Users.Add(pending);

            DateOnly Open(int n) { var d = clock.Today.AddDays(n); while (d.DayOfWeek == DayOfWeek.Sunday) d = d.AddDays(1); return d; }
            // the default weekday grid: 09:30, 11:00, 14:00, 15:30, 17:00, 18:30
            TimeOnly[] slot = [new(9, 30), new(11, 0), new(14, 0), new(15, 30), new(17, 0), new(18, 30)];
            db.Lessons.AddRange(
                new Lesson { Student = students[0], Date = clock.Today.AddDays(-2), Time = slot[3], Status = LessonStatus.Attended },
                new Lesson { Student = students[0], Date = Open(2), Time = slot[5] },
                new Lesson { Student = students[2], Date = Open(3), Time = slot[2] },
                new Lesson { Student = students[3], Date = Open(1), Time = slot[4] });
            db.Payments.Add(new Payment { Student = students[4], PackageSize = 8, Amount = 6200, ReceiptPath = "missing.jpg", ContentType = "image/jpeg", Note = "已轉帳" });
        }
        await db.SaveChangesAsync();
    }
}
