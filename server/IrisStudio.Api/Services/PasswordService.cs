using IrisStudio.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

public static class PasswordService
{
    public static string? RuleProblem(string? password) => password is null || password.Length is < 8 or > 128
        || !password.Any(c => c is >= 'A' and <= 'Z') || !password.Any(c => c is >= 'a' and <= 'z') || !password.Any(c => c is >= '0' and <= '9')
        ? "密碼需要 8–128 個字元，並包含大寫字母、小寫字母和數字。" : null;

    public static async Task<bool> WasUsedAsync(AppDbContext db, User user, string password, PasswordHasher<User> hasher, CancellationToken ct)
    {
        // The current password is the most recent of the last three; also supports pre-migration accounts.
        var hashes = await db.PasswordHistories.Where(h => h.UserId == user.Id).OrderByDescending(h => h.CreatedAtUtc)
            .Select(h => h.PasswordHash).Take(2).ToListAsync(ct);
        if (user.PasswordHash is { } current) hashes.Add(current);
        return hashes.Any(hash => hasher.VerifyHashedPassword(user, hash, password) != PasswordVerificationResult.Failed);
    }
}
