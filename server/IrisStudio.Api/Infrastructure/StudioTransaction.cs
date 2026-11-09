using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace IrisStudio.Api.Infrastructure;

/// <summary>
/// This single-teacher studio has one writer at a time, across API instances and background jobs.
/// Acquire before reading mutable state so credit and decision operations cannot race.
/// Both database providers release the lock on commit, rollback, or connection loss.
/// </summary>
public static class StudioTransaction
{
    public static async Task<IDbContextTransaction> BeginAsync(AppDbContext db, CancellationToken ct)
    {
        var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            await AcquireLockAsync(db, 5283361402929340417, ct);
            return tx;
        }
        catch
        {
            await tx.DisposeAsync();
            throw;
        }
    }

    public static async Task AcquireLockAsync(AppDbContext db, long key, CancellationToken ct)
    {
        if (db.Database.IsSqlServer())
        {
            var resource = $"IrisStudio:{key}";
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                DECLARE @result int;
                EXEC @result = sys.sp_getapplock @Resource = {resource},
                    @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
                IF @result < 0 THROW 51000, 'Could not acquire the studio transaction lock.', 1;
                """, ct);
        }
        else
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})", ct);
        }
    }
}

public sealed class StudioMutationFilter(AppDbContext db, Services.ReceiptStorage receipts) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        if (HttpMethods.IsGet(ctx.HttpContext.Request.Method)) return await next(ctx);
        var committed = false;
        await using var tx = await StudioTransaction.BeginAsync(db, ctx.HttpContext.RequestAborted);
        try
        {
            var result = await next(ctx);
            if (result is IStatusCodeHttpResult { StatusCode: >= 400 }) return result;
            await db.SaveChangesAsync(ctx.HttpContext.RequestAborted);
            await tx.CommitAsync(ctx.HttpContext.RequestAborted);
            committed = true;
            return result;
        }
        finally
        {
            if (!committed) receipts.DeleteUncommitted();
        }
    }
}
