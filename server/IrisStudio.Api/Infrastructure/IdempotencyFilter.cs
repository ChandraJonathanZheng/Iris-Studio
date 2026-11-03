using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

namespace IrisStudio.Api.Infrastructure;

/// <summary>
/// #19 Idempotency-Key support for actions that move credits or money (book, confirm/reject receipt, upload receipt).
///
/// How it works:
///  1. Open a transaction and INSERT the key. The key is the primary key, so a second request with the same key
///     can't insert it: we read the saved row instead.
///  2. Run the endpoint inside that same transaction (BookingService joins it).
///  3. Save the 2xx response on the key row and COMMIT. Booking + key are saved together, or not at all.
///
/// Same key + same body → saved response is replayed (header Idempotent-Replayed: true). Same key + different
/// body → 422. Same key while the first request is still running → 409. Failed requests (4xx/5xx) are rolled back
/// together with the key, so retrying them simply runs again (they changed nothing).
/// </summary>
public class IdempotencyFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        if (!http.Request.Headers.TryGetValue("Idempotency-Key", out var raw)) return await next(ctx);
        if (!Guid.TryParse(raw, out var key)) return Problems.Of(400, "bad_idempotency_key", "Idempotency-Key 必須是 UUID。");

        var db = http.RequestServices.GetRequiredService<AppDbContext>();
        var json = http.RequestServices.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
        var userId = http.User.UserId();
        var endpoint = $"{http.Request.Method} {http.Request.Path}";
        var hash = Hash(endpoint, ctx.Arguments);

        await using var tx = await db.Database.BeginTransactionAsync(http.RequestAborted);
        db.IdempotencyRecords.Add(new IdempotencyRecord { Key = key, UserId = userId, Endpoint = endpoint, RequestHash = hash });
        try
        {
            await db.SaveChangesAsync(http.RequestAborted);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            await tx.RollbackAsync();
            db.ChangeTracker.Clear();
            var saved = await db.IdempotencyRecords.AsNoTracking().FirstAsync(r => r.Key == key);
            if (saved.UserId != userId || saved.RequestHash != hash)
                return Problems.Of(422, "idempotency_mismatch", "同一個請求編號被用在不同的內容。");
            if (saved.StatusCode is null)
                return Problems.Of(409, "in_progress", "這個請求還在處理中，請稍候。");
            http.Response.Headers["Idempotent-Replayed"] = "true";
            return Results.Text(saved.ResponseJson ?? "null", "application/json", Encoding.UTF8, saved.StatusCode);
        }

        object? result;
        try
        {
            result = await next(ctx);
        }
        catch (BizException biz)
        {
            await tx.RollbackAsync();
            return Problems.From(biz);
        }

        var status = (result as IStatusCodeHttpResult)?.StatusCode ?? 200;
        if (status >= 400) { await tx.RollbackAsync(); return result; }

        var body = result is IValueHttpResult v ? JsonSerializer.Serialize(v.Value, json) : "null";
        await db.IdempotencyRecords.Where(r => r.Key == key)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.StatusCode, status).SetProperty(r => r.ResponseJson, body), http.RequestAborted);
        await tx.CommitAsync(http.RequestAborted);
        return result;
    }

    /// <summary>Hash of the endpoint + its bound arguments (DTOs, ids, uploaded file name/size). Services are skipped.</summary>
    private static string Hash(string endpoint, IList<object?> args)
    {
        var parts = new List<string> { endpoint };
        foreach (var a in args)
        {
            switch (a)
            {
                case null: parts.Add("null"); break;
                case string or Guid or int or bool: parts.Add(a.ToString()!); break;
                case IFormFile f: parts.Add($"file:{f.FileName}:{f.Length}"); break;
                case IFormCollection form: parts.Add(string.Join("&", form.Where(kv => kv.Key != "receipt").Select(kv => $"{kv.Key}={kv.Value}"))); break;
                default:
                    if (a.GetType().Namespace == typeof(Contracts.BookRequest).Namespace) parts.Add(JsonSerializer.Serialize(a));
                    break;
            }
        }
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("|", parts))));
    }
}
