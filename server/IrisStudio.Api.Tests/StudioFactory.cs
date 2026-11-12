using System.Net.Http.Json;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authentication;
using System.Collections.Concurrent;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace IrisStudio.Api.Tests;

public sealed class TestClock : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.Parse("2026-11-09T00:00:00Z");
    public override DateTimeOffset GetUtcNow() => _now;
    public void Reset() => _now = DateTimeOffset.Parse("2026-11-09T00:00:00Z");
    public void Advance(TimeSpan duration) => _now += duration;
}

public sealed class TestChannel : IAlertChannel
{
    public ConcurrentDictionary<Guid, int> Attempts { get; } = new();
    public HashSet<Guid> Failing { get; } = [];
    public Task SendAsync(User user, Alert alert, CancellationToken ct)
    {
        Attempts.AddOrUpdate(alert.Id, 1, (_, n) => n + 1);
        if (Failing.Contains(alert.Id)) throw new HttpRequestException("Simulated provider failure");
        return Task.CompletedTask;
    }
}

/// <summary>Captures rendered emails instead of contacting a provider.</summary>
public sealed class TestEmailSender : IEmailSender
{
    public ConcurrentQueue<OutgoingEmail> Sent { get; } = new();
    public bool Fail { get; set; }
    public Task SendAsync(OutgoingEmail email, CancellationToken ct)
    {
        if (Fail) throw new HttpRequestException("Simulated provider failure for someone@example.test");
        Sent.Enqueue(email);
        return Task.CompletedTask;
    }
}

public sealed class TestClientAddress : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (ctx, proceed) =>
        {
            if (IPAddress.TryParse(ctx.Request.Headers["X-Test-Client"], out var ip)) ctx.Connection.RemoteIpAddress = ip;
            await proceed(ctx);
        });
        next(app);
    };
}

public class StudioFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    protected virtual bool UseLineLogin => false;
    /// <summary>Email tests turn delivery on; everything else keeps it off.</summary>
    protected virtual bool NotificationsEnabled => false;
    public TestEmailSender Email { get; } = new();
    public const string JwtSigningKey = "iris-integration-tests-only-signing-secret-64-characters-minimum-key";
    private readonly string _database = $"iris_test_{Guid.NewGuid():N}";
    private readonly string _folder = Path.Combine(Path.GetTempPath(), $"iris-receipts-{Guid.NewGuid():N}");
    private readonly string _provider = Environment.GetEnvironmentVariable("IRIS_TEST_PROVIDER") ?? "SqlServer";
    private string _admin = "";
    private string _connection = "";
    private bool _databaseCreated;
    public TestClock Clock { get; } = new();
    public TestChannel Channel { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:Provider"] = _provider,
            ["ConnectionStrings:Db"] = _connection,
            ["Studio:TeacherEmail"] = "teacher@test.local",
            ["Studio:TeacherPassword"] = "test-teacher-Password12!",
            ["Studio:SeedDemo"] = "false",
            ["Studio:ReceiptsFolder"] = _folder,
            ["Studio:ReelsFolder"] = Path.Combine(_folder, "reels"),
            ["Studio:RunBackgroundJobs"] = "false",
            ["Notifications:Enabled"] = NotificationsEnabled ? "true" : "false",
            ["Notifications:BaseUrl"] = "https://iris.test",
            ["Notifications:EmailProvider"] = "Smtp",
            ["Logging:LogLevel:Default"] = "Error",
            ["Jwt:SigningKey"] = JwtSigningKey,
        }));
        builder.ConfigureTestServices(services =>
        {
            // Test configuration is applied after Program chooses its context registration.
            services.RemoveAll<AppDbContext>();
            services.RemoveAll<SqlServerDbContext>();
            services.RemoveAll<DbContextOptions>();
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<DbContextOptions<SqlServerDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<SqlServerDbContext>>();
            if (_provider == "SqlServer")
                services.AddDbContext<AppDbContext, SqlServerDbContext>(o => o.UseSqlServer(_connection));
            else
                services.AddDbContext<AppDbContext>(o => o.UseNpgsql(_connection));
            services.AddSingleton<IStartupFilter, TestClientAddress>();
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.RemoveAll<IAlertChannel>();
            services.AddSingleton<IAlertChannel>(Channel);
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(Email);
            foreach (var item in services.Where(s => s.ServiceType == typeof(IHostedService)
                && (s.ImplementationType == typeof(AlertDispatcher) || s.ImplementationType == typeof(StudioMaintenance))).ToArray()) services.Remove(item);
        });
    }

    async Task IAsyncLifetime.InitializeAsync()
    {
        if (_provider == "SqlServer")
        {
            _admin = Environment.GetEnvironmentVariable("IRIS_TEST_DB")
                ?? @"Server=.\MSSQLDEV2022;Database=master;Integrated Security=True;Encrypt=True;TrustServerCertificate=True";
            _connection = new SqlConnectionStringBuilder(_admin) { InitialCatalog = _database }.ConnectionString;
            await using var connection = new SqlConnection(_admin);
            await connection.OpenAsync();
            await using var command = new SqlCommand($"CREATE DATABASE [{_database}]", connection);
            await command.ExecuteNonQueryAsync();
        }
        else if (_provider == "PostgreSql")
        {
            _admin = Environment.GetEnvironmentVariable("IRIS_TEST_DB")
                ?? throw new InvalidOperationException("Set IRIS_TEST_DB to a local PostgreSQL connection with CREATE DATABASE permission.");
            _connection = new NpgsqlConnectionStringBuilder(_admin) { Database = _database }.ConnectionString;
            await using var connection = new NpgsqlConnection(_admin);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand($"CREATE DATABASE \"{_database}\"", connection);
            await command.ExecuteNonQueryAsync();
        }
        else throw new InvalidOperationException("Set IRIS_TEST_PROVIDER to SqlServer or PostgreSql.");
        _databaseCreated = true;
        // Keep tests independent of real LINE credentials configured on a developer's machine.
        if (!UseLineLogin) Services.GetRequiredService<IAuthenticationSchemeProvider>().RemoveScheme("line");
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        if (_databaseCreated && _provider == "SqlServer")
        {
            SqlConnection.ClearAllPools();
            await using var connection = new SqlConnection(_admin);
            await connection.OpenAsync();
            await using var command = new SqlCommand($"ALTER DATABASE [{_database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_database}]", connection);
            await command.ExecuteNonQueryAsync();
        }
        else if (_databaseCreated)
        {
            NpgsqlConnection.ClearAllPools();
            await using var connection = new NpgsqlConnection(_admin);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_database}\" WITH (FORCE)", connection);
            await command.ExecuteNonQueryAsync();
        }
        if (Directory.Exists(_folder)) Directory.Delete(_folder, true);
    }

    public async Task ResetAsync()
    {
        Clock.Reset(); Channel.Attempts.Clear(); Channel.Failing.Clear(); Email.Sent.Clear(); Email.Fail = false;
        await Db(async db => await db.Database.ExecuteSqlRawAsync(db.Database.IsSqlServer() ? """
            DELETE FROM [EmailMessages]; DELETE FROM [AuthTokens];
            DELETE FROM [Alerts]; DELETE FROM [ChangeRequests]; DELETE FROM [CreditLogs];
            DELETE FROM [IdempotencyRecords]; DELETE FROM [ConsentRecords]; DELETE FROM [PrivacyRequests];
            DELETE FROM [Lessons]; DELETE FROM [Payments]; DELETE FROM [Users]; DELETE FROM [Consults];
            DELETE FROM [BookingSettings]; DELETE FROM [WeeklyAvailability]; DELETE FROM [DateOverrides]; DELETE FROM [InstagramReels];
            """ : """
            TRUNCATE "EmailMessages", "AuthTokens", "Alerts", "ChangeRequests", "CreditLogs", "IdempotencyRecords", "ConsentRecords", "PrivacyRequests", "Lessons", "Payments", "Users", "Consults", "BookingSettings", "WeeklyAvailability", "DateOverrides", "InstagramReels" CASCADE
            """));
        await Seed.RunAsync(Services, false);
    }

    public async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task<HttpClient> Login(string email = "teacher@test.local", string password = "test-teacher-Password12!")
    {
        var client = Anonymous();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    private int _clientNumber;
    public HttpClient Anonymous()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        var number = Interlocked.Increment(ref _clientNumber);
        client.DefaultRequestHeaders.Add("X-Test-Client", $"127.1.{number / 250}.{number % 250 + 1}");
        return client;
    }

    public async Task<(Guid id, HttpClient client)> Student(int credits = 4, LessonType type = LessonType.Private, bool active = true)
    {
        var email = $"{Guid.NewGuid():N}@test.local";
        var client = Anonymous();
        var registered = await client.PostAsJsonAsync("/api/auth/register", new {
            name = "學生", email, password = "Student-password123!",
            consents = new { version = "2026-11-08", terms = true, media = false, marketing = false, minor = false, guardian = (object?)null }
        });
        registered.EnsureSuccessStatusCode();
        var id = (await registered.Content.ReadFromJsonAsync<System.Text.Json.Nodes.JsonObject>())!["id"]!.GetValue<Guid>();
        await Db(async db =>
        {
            var user = await db.Users.SingleAsync(u => u.Id == id);
            user.Credits = credits; user.ClassType = type; user.Status = active ? UserStatus.Active : UserStatus.Pending;
            return await db.SaveChangesAsync();
        });
        return (id, client);
    }
}
