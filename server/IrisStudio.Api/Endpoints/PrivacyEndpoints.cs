using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Endpoints;

/// <summary>Consents (own account) and 個資權利申請 (anyone → Iris).</summary>
public static class PrivacyEndpoints
{
    public static void MapPrivacy(this IEndpointRouteBuilder app)
    {
        // Own consent log. Any signed-in account (a Pending student coming back from LINE sign-up sends the choices here).
        var me = app.MapGroup("/api/me").RequireAuthorization();
        me.MapGet("/consents", async (HttpContext http, ConsentService c, CancellationToken ct) => TypedResults.Ok(await c.MineAsync(http.User.UserId(), ct)));
        me.MapPost("/consents", async (ConsentInput r, HttpContext http, AppDbContext db, ConsentService c, CancellationToken ct) =>
        {
            var id = http.User.UserId();
            if (await c.ValidateAsync(id, r, ct) is { } bad) return Problems.Of(400, "consent_required", bad);
            await c.RecordAsync(id, r, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(await c.MineAsync(id, ct));
        });

        // Public on purpose: the rights don't depend on having an account. Rate-limited like the consult form.
        app.MapPost("/api/public/privacy-requests", async (PrivacyRequestInput r, AppDbContext db, CancellationToken ct) =>
        {
            var name = (r.Name ?? "").Trim(); var contact = (r.Contact ?? "").Trim(); var detail = (r.Detail ?? "").Trim();
            if (name.Length is 0 or > 80 || contact.Length is 0 or > 120) return Problems.Of(400, "validation", "請填寫姓名和聯絡方式。");
            if (!Enum.TryParse<PrivacyRequestType>(r.Type, true, out var type)) return Problems.Of(400, "validation", "請選擇申請項目。");
            if (detail.Length > 1000) return Problems.Of(400, "validation", "說明最多 1000 字。");
            var p = new PrivacyRequest { Name = name, Contact = contact, Type = type, Detail = detail };
            db.PrivacyRequests.Add(p);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/teacher/privacy-requests/{p.Id}", new { p.Id, DueAt = Dto(p).DueAt });
        }).RequireRateLimiting("consult");

        var t = app.MapGroup("/api/teacher/privacy-requests").RequireAuthorization("Teacher");
        t.MapGet("", async (AppDbContext db, CancellationToken ct) =>
            TypedResults.Ok((await db.PrivacyRequests.AsNoTracking().OrderBy(p => p.Done).ThenBy(p => p.CreatedAtUtc).ToListAsync(ct)).Select(Dto).ToArray()));
        t.MapPost("/{id:guid}/done", async (Guid id, NoteRequest r, AppDbContext db, CancellationToken ct) =>
        {
            var note = (r.Note ?? "").Trim();
            if (note.Length is 0 or > 500) return Problems.Of(400, "validation", "請簡單記錄處理結果。");
            var p = await db.PrivacyRequests.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (p is null) return Problems.Of(404, "not_found", "找不到申請。");
            p.Done = true; p.Note = note; p.HandledAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(p));
        });
    }

    static PrivacyRequestDto Dto(PrivacyRequest p)
    {
        var created = DateTime.SpecifyKind(p.CreatedAtUtc, DateTimeKind.Utc);
        return new(p.Id, p.Name, p.Contact, p.Type.Camel(), p.Detail, p.Done ? "done" : "open", created, created.AddDays(PrivacyRequest.DaysFor(p.Type)),
            p.HandledAtUtc is { } h ? DateTime.SpecifyKind(h, DateTimeKind.Utc) : null, p.Note);
    }
}
