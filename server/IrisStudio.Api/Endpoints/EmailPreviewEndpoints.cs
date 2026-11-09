using System.Net;
using System.Text;
using IrisStudio.Api.Contracts;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;

namespace IrisStudio.Api.Endpoints;

/// <summary>
/// Development only (mapped behind IsDevelopment in Program.cs). Renders every template with sample data:
/// /api/dev/emails shows each one at desktop (600px) and phone (375px) width; ?format=text shows the plain-text part.
/// "Send test" goes through the real outbox and provider, to the signed-in teacher's own address only.
/// </summary>
public static class EmailPreviewEndpoints
{
    public static void MapEmailPreviews(this IEndpointRouteBuilder app)
    {
        var dev = app.MapGroup("/api/dev/emails");

        dev.MapGet("", () =>
        {
            var html = new StringBuilder("""
                <!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>IRIS email previews</title>
                <style>body{font-family:system-ui,sans-serif;background:#ece6dc;margin:0;padding:24px;color:#203129}h2{margin:40px 0 4px}
                .row{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}iframe{border:1px solid #d8cfc1;background:#fff;border-radius:8px}
                a{color:#203129}</style></head><body><h1>IRIS Studio · Email previews</h1>
                """);
            foreach (var group in EmailTemplates.All.GroupBy(t => t.Group))
            {
                html.Append($"<h2>{WebUtility.HtmlEncode(group.Key)}</h2>");
                foreach (var t in group)
                    html.Append($"""
                        <h3>{t.Key} · {WebUtility.HtmlEncode(t.Subject)} <small>(<a href="/api/dev/emails/{t.Key}?format=text">純文字</a> · {t.Preference} · {t.Category})</small></h3>
                        <div class="row"><iframe src="/api/dev/emails/{t.Key}" width="640" height="760" title="{t.Key} desktop"></iframe>
                        <iframe src="/api/dev/emails/{t.Key}" width="375" height="760" title="{t.Key} mobile"></iframe></div>
                        """);
            }
            return Results.Content(html.Append("</body></html>").ToString(), "text/html; charset=utf-8");
        });

        dev.MapGet("/{key}", (string key, string? format, EmailRenderer renderer) =>
        {
            if (!EmailTemplates.Exists(key)) return Problems.Of(404, "not_found", "沒有這個模板。");
            var t = EmailTemplates.Get(key);
            var r = renderer.Render(t, EmailTemplates.Sample(t), t.Category == EmailCategory.Marketing ? "/unsubscribe?t=preview" : null);
            return format == "text" ? Results.Text(r.Text, "text/plain; charset=utf-8") : Results.Content(r.Html, "text/html; charset=utf-8");
        });

        dev.MapPost("/{key}/send", async (string key, HttpContext http, AppDbContext db, AlertService alerts, CancellationToken ct) =>
        {
            if (!EmailTemplates.Exists(key)) return Problems.Of(404, "not_found", "沒有這個模板。");
            var t = EmailTemplates.Get(key);
            if (t.Category == EmailCategory.Marketing) return Problems.Of(400, "validation", "行銷模板需要收件人同意，請用預覽檢查。");
            var me = await db.Users.FindAsync([http.User.UserId()], ct);
            if (me?.Email is null) return Problems.Of(409, "no_email", "你的帳號沒有 Email。");
            // sample data has no guard ids, so the send-time checks pass; a fresh key per test send
            var data = new Dictionary<string, string>(EmailTemplates.Sample(t));
            await alerts.EmailAsync(me, key, data, $"test:{key}:{Guid.NewGuid():N}", delay: false, ct: ct);
            await db.SaveChangesAsync(ct);
            return Results.Accepted();
        }).RequireAuthorization("Teacher");
    }
}
