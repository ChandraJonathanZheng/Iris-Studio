using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>Retention periods (Studio:Retention). The defaults are PROPOSALS, marked 【待確認】 in the privacy policy.</summary>
public class RetentionOptions
{
    /// <summary>Free-consult forms that never became a student.</summary>
    public int ConsultMonths { get; set; } = 12;
    /// <summary>Read alerts (the in-app 通知 list).</summary>
    public int AlertMonths { get; set; } = 12;
    /// <summary>Handled 個資權利申請 (kept as proof of handling).</summary>
    public int PrivacyRequestYears { get; set; } = 3;
    /// <summary>Idempotency keys only guard double taps.</summary>
    public int IdempotencyHours { get; set; } = 24;
    /// <summary>Email delivery log (sent / skipped / failed rows). Queued rows are never deleted here.</summary>
    public int EmailLogDays { get; set; } = 90;
}

/// <summary>
/// Deletes personal data whose purpose is over, every 6 hours. Consent records, payments and lessons are NOT touched here:
/// they are proof / accounting records with their own (to be confirmed) legal periods.
/// </summary>
public class RetentionService(IServiceScopeFactory scopes, IOptions<RetentionOptions> o, ILogger<RetentionService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var now = DateTime.UtcNow; var r = o.Value;
                var n = await db.IdempotencyRecords.Where(x => x.CreatedAtUtc < now.AddHours(-r.IdempotencyHours)).ExecuteDeleteAsync(stop)
                      + await db.Consults.Where(x => x.CreatedAtUtc < now.AddMonths(-r.ConsultMonths)).ExecuteDeleteAsync(stop)
                      + await db.Alerts.Where(x => x.Read && x.CreatedAtUtc < now.AddMonths(-r.AlertMonths)).ExecuteDeleteAsync(stop)
                      + await db.PrivacyRequests.Where(x => x.Done && x.HandledAtUtc < now.AddYears(-r.PrivacyRequestYears)).ExecuteDeleteAsync(stop)
                      + await db.EmailMessages.Where(x => x.Status != EmailStatus.Queued && x.CreatedAtUtc < now.AddDays(-r.EmailLogDays)).ExecuteDeleteAsync(stop)
                      + await db.AuthTokens.Where(x => x.ExpiresAtUtc < now.AddDays(-7)).ExecuteDeleteAsync(stop);
                if (n > 0) log.LogInformation("Retention: deleted {Count} expired rows", n);
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { log.LogError(ex, "Retention run failed"); }
        } while (await timer.WaitForNextTickAsync(stop));
    }
}
