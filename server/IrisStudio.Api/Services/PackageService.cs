using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>
/// 課程方案 (packages & prices). Lives in the database so Iris can change it herself.
/// Until she saves once, the list from appsettings (Studio:Packages) is used.
/// Changing a price never touches receipts already uploaded: a Payment stores its own size + amount.
/// </summary>
public class PackageService(AppDbContext db, IOptions<StudioOptions> options)
{
    public const int MaxPackages = 8, MaxSize = 100, MaxPrice = 500_000;

    public async Task<PackageOption[]> GetAsync(CancellationToken ct)
    {
        var rows = await db.PricePackages.AsNoTracking().OrderByDescending(p => p.IsTrial).ThenBy(p => p.Size).ToListAsync(ct);
        return rows.Count == 0 ? options.Value.Packages
            : rows.Select(p => new PackageOption { Size = p.Size, Price = p.Price, Trial = p.IsTrial }).ToArray();
    }

    /// <summary>Validates and replaces the whole list. Returns a message for the user when the list is not acceptable.</summary>
    public async Task<string?> ReplaceAsync(PackageOption[]? list, CancellationToken ct)
    {
        if (list is null || list.Length == 0) return "至少要有一個方案。";
        if (list.Length > MaxPackages) return $"最多 {MaxPackages} 個方案。";
        if (list.Count(p => p.Trial) > 1) return "單堂課只能有一個。";
        if (list.Any(p => p.Trial && p.Size != 1)) return "單堂課固定是 1 堂。";
        if (!list.Any(p => !p.Trial)) return "至少要有一個一般方案（例如 4 堂）。";
        if (list.Any(p => p.Size < 1 || p.Size > MaxSize)) return $"堂數要在 1–{MaxSize} 之間。";
        if (list.Any(p => p.Price < 1 || p.Price > MaxPrice)) return $"價格要在 NT$1–{MaxPrice:N0} 之間。";
        if (list.Select(p => p.Size).Distinct().Count() != list.Length) return "每個方案的堂數不能重複。";

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.PricePackages.ExecuteDeleteAsync(ct);
        db.PricePackages.AddRange(list.OrderByDescending(p => p.Trial).ThenBy(p => p.Size)
            .Select((p, i) => new PricePackage { Size = p.Size, Price = p.Price, IsTrial = p.Trial, SortOrder = i }));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return null;
    }
}
