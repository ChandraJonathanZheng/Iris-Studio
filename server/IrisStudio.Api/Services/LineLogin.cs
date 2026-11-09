using System.Security.Claims;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

public sealed class LineLogin(AppDbContext db, AlertService alerts, StudioClock clock)
{
    public async Task<User> FindOrCreateAsync(ClaimsPrincipal identity, CancellationToken ct)
    {
        var sub = identity.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(sub)) throw new InvalidOperationException("LINE subject is missing.");
        await using var tx = await StudioTransaction.BeginAsync(db, ct);
        var user = await db.Users.SingleOrDefaultAsync(u => u.LineUserId == sub, ct);
        if (user is null)
        {
            var name = identity.FindFirstValue("name");
            if (string.IsNullOrWhiteSpace(name)) name = "LINE 使用者";
            user = new User { Name = name[..Math.Min(80, name.Length)], LineUserId = sub, AvatarUrl = identity.FindFirstValue("picture") };
            db.Users.Add(user);
            await alerts.EmailTeacherAsync("teacher-new-registration", new()
            {
                ["studentName"] = user.Name, ["contact"] = "LINE 登入", ["registeredAt"] = EmailFormat.Local(clock.LocalNow),
            }, $"teacher-registration:{user.Id}", ct);
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        // Existing studio profile, role, and approval status remain authoritative.
        return user;
    }

    public static string Destination(User user, string? returnUrl) =>
        user.Role == Role.Teacher ? "/teacher" : user.Status == UserStatus.Pending ? "/pending"
        : Input.IsLocalUrl(returnUrl) && (returnUrl == "/app" || returnUrl!.StartsWith("/app/", StringComparison.Ordinal)) ? returnUrl! : "/app";
}
