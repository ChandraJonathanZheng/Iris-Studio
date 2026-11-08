using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Services;

/// <summary>
/// Consent log rules (mirrored in client/src/mocks/handlers.ts):
/// - terms + privacy notice must be accepted once (sign-up);
/// - a minor needs a guardian (name, relation, contact, agreed) at sign-up;
/// - later, a minor switching an optional consent ON needs the guardian's confirmation; withdrawing never does;
/// - a row is written only when a choice changes, so the log reads as real decisions.
/// </summary>
public class ConsentService(AppDbContext db)
{
    public async Task<ConsentRecord?> LatestAsync(Guid userId, ConsentKind kind, CancellationToken ct) =>
        await db.ConsentRecords.AsNoTracking().Where(c => c.UserId == userId && c.Kind == kind).OrderByDescending(c => c.CreatedAtUtc).FirstOrDefaultAsync(ct);

    /// <summary>Returns a problem message, or null when the input is acceptable.</summary>
    public async Task<string?> ValidateAsync(Guid? userId, ConsentInput? c, CancellationToken ct)
    {
        if (c is null || string.IsNullOrWhiteSpace(c.Version) || c.Version.Length > 40) return "缺少同意版本。";
        var first = userId is null || await LatestAsync(userId.Value, ConsentKind.Terms, ct) is null;
        if (first && !c.Terms) return "請閱讀並同意服務條款與隱私權政策。";
        if (first && c.Minor && (c.Guardian is not { Agreed: true } g || Blank(g.Name) || Blank(g.Relation) || Blank(g.Contact)))
            return "未滿 18 歲需填寫法定代理人資料並由其同意。";
        if (!first && userId is { } id && (await LatestAsync(id, ConsentKind.Guardian, ct))?.Granted == true)
        {
            var media = (await LatestAsync(id, ConsentKind.Media, ct))?.Granted == true;
            var mkt = (await LatestAsync(id, ConsentKind.Marketing, ct))?.Granted == true;
            if (((c.Media && !media) || (c.Marketing && !mkt)) && c.Guardian is not { Agreed: true })
                return "未滿 18 歲，開啟此同意需由法定代理人確認。";
        }
        return null;
    }

    /// <summary>Adds the rows (caller saves). Call ValidateAsync first.</summary>
    public async Task RecordAsync(Guid userId, ConsentInput c, CancellationToken ct)
    {
        var first = await LatestAsync(userId, ConsentKind.Terms, ct) is null;
        var source = first ? ConsentSource.Register : ConsentSource.Profile;
        var g = first && c.Minor ? c.Guardian : null;
        void Add(ConsentKind k, bool granted, string scope = "") => db.ConsentRecords.Add(new ConsentRecord
        {
            UserId = userId, Kind = k, Granted = granted, Version = c.Version.Trim(), Scope = scope, Source = source,
            GuardianName = g?.Name?.Trim(), GuardianRelation = g?.Relation?.Trim(), GuardianContact = g?.Contact?.Trim(),
        });
        if (first) { Add(ConsentKind.Terms, true); Add(ConsentKind.Privacy, true); if (c.Minor) Add(ConsentKind.Guardian, true); }
        var media = await LatestAsync(userId, ConsentKind.Media, ct);
        if (media is null ? first : media.Granted != c.Media) Add(ConsentKind.Media, c.Media, "photo,video,voice");
        var mkt = await LatestAsync(userId, ConsentKind.Marketing, ct);
        if (mkt is null ? first : mkt.Granted != c.Marketing) Add(ConsentKind.Marketing, c.Marketing, "line,email");
    }

    public async Task<MyConsentsDto> MineAsync(Guid userId, CancellationToken ct)
    {
        var rows = await db.ConsentRecords.AsNoTracking().Where(c => c.UserId == userId).OrderByDescending(c => c.CreatedAtUtc).ToListAsync(ct);
        ConsentRecord? L(ConsentKind k) => rows.FirstOrDefault(r => r.Kind == k);
        ConsentStateDto S(ConsentKind k) => new(L(k)?.Granted == true, L(k) is { } r ? Utc(r.CreatedAtUtc) : null);
        var g = rows.LastOrDefault(r => r.Kind == ConsentKind.Guardian && r.Granted);
        return new MyConsentsDto(S(ConsentKind.Media), S(ConsentKind.Marketing), L(ConsentKind.Guardian)?.Granted == true, g?.GuardianName,
            rows.Select(r => new ConsentRecordDto(r.Kind.Camel(), r.Granted, r.Version, Utc(r.CreatedAtUtc), r.Source.Camel())).ToArray());
    }

    public async Task<StudentConsentDto> SummaryAsync(Guid userId, CancellationToken ct)
    {
        var rows = await db.ConsentRecords.AsNoTracking().Where(c => c.UserId == userId && (c.Kind == ConsentKind.Media || c.Kind == ConsentKind.Marketing || c.Kind == ConsentKind.Guardian))
            .OrderByDescending(c => c.CreatedAtUtc).ToListAsync(ct);
        var media = rows.FirstOrDefault(r => r.Kind == ConsentKind.Media);
        return new StudentConsentDto(media?.Granted == true, media is null ? null : Utc(media.CreatedAtUtc),
            media is { Granted: false } && rows.Any(r => r.Kind == ConsentKind.Media && r.Granted),
            rows.FirstOrDefault(r => r.Kind == ConsentKind.Marketing)?.Granted == true,
            rows.FirstOrDefault(r => r.Kind == ConsentKind.Guardian)?.Granted == true);
    }

    static bool Blank(string? s) => string.IsNullOrWhiteSpace(s);
    static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);
}
