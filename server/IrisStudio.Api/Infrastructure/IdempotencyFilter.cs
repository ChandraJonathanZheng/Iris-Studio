using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Infrastructure;

/// <summary>Runs inside StudioMutationFilter's transaction; the action and replay record commit together.</summary>
public sealed class IdempotencyFilter(AppDbContext db, IOptions<JsonOptions> json, StudioClock clock) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        if (!http.Request.Headers.TryGetValue("Idempotency-Key", out var raw)) return await next(ctx);
        if (!Guid.TryParse(raw, out var key)) return Problems.Of(400, "bad_idempotency_key", "Idempotency-Key 必須是 UUID。");
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Idempotency requires a mutation transaction.");

        var userId = http.User.UserId();
        var endpoint = $"{http.Request.Method} {http.Request.Path}";
        var hash = await HashAsync(endpoint, ctx.Arguments, http.RequestAborted);
        var saved = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(r => r.Key == key, http.RequestAborted);
        if (saved is not null)
        {
            if (saved.UserId != userId || saved.Endpoint != endpoint || saved.RequestHash != hash)
                return Problems.Of(422, "idempotency_mismatch", "同一個請求編號被用在不同的內容。");
            http.Response.Headers["Idempotent-Replayed"] = "true";
            if (saved.ResponseLocation is not null) http.Response.Headers.Location = saved.ResponseLocation;
            return saved.StatusCode == 204 ? Results.NoContent()
                : Results.Text(saved.ResponseJson ?? "null", "application/json", Encoding.UTF8, saved.StatusCode ?? 200);
        }

        var result = await next(ctx);
        var status = (result as IStatusCodeHttpResult)?.StatusCode ?? 200;
        if (status >= 400) return result;
        db.IdempotencyRecords.Add(new IdempotencyRecord
        {
            Key = key, UserId = userId, Endpoint = endpoint, RequestHash = hash, StatusCode = status,
            ResponseJson = result is IValueHttpResult v ? JsonSerializer.Serialize(v.Value, json.Value.SerializerOptions) : "null",
            // Created<T> and Created expose Location without sharing a Location interface.
            ResponseLocation = result?.GetType().GetProperty("Location")?.GetValue(result) as string,
            CreatedAtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(http.RequestAborted);
        return result;
    }

    private static async Task<string> HashAsync(string endpoint, IList<object?> args, CancellationToken ct)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        void Add(object? value)
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
            hash.AppendData(BitConverter.GetBytes(bytes.Length));
            hash.AppendData(bytes);
        }
        Add(endpoint);
        foreach (var arg in args)
        {
            if (arg is IFormCollection form)
            {
                foreach (var field in form.OrderBy(f => f.Key, StringComparer.Ordinal)) { Add(field.Key); Add(field.Value.ToArray()); }
                foreach (var file in form.Files.OrderBy(f => f.Name, StringComparer.Ordinal))
                {
                    Add(file.Name); Add(file.Length);
                    await using var stream = file.OpenReadStream();
                    hash.AppendData(await SHA256.HashDataAsync(stream, ct));
                }
            }
            else if (arg is string or Guid or int or bool || arg?.GetType().Namespace == typeof(Contracts.BookRequest).Namespace) Add(arg);
        }
        return Convert.ToHexString(hash.GetHashAndReset());
    }
}
