using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace IrisStudio.Api.Tests;

public sealed class PasswordRecoveryTests(EmailFactory app) : IClassFixture<EmailFactory>, IAsyncLifetime
{
    public Task InitializeAsync() => app.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private Task<string> Email(Guid id) => app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.Email!).SingleAsync());
    private async Task<string> RequestLink(string email)
    {
        using var client = app.Anonymous();
        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        var message = await app.Db(db => db.EmailMessages.AsNoTracking().Where(m => m.Template == "password-reset")
            .OrderByDescending(m => m.CreatedAtUtc).FirstAsync());
        await new AlertDispatcher(app.Services.GetRequiredService<IServiceScopeFactory>(), NullLogger<AlertDispatcher>.Instance).DispatchAsync(default);
        var sent = app.Email.Sent.Single(m => m.Id == message.Id);
        Assert.Contains("https://iris.test/reset-password?token=", sent.Text);
        return Regex.Match(sent.Text, @"reset-password\?token=([A-Za-z0-9_-]+)").Groups[1].Value;
    }
    private async Task<HttpResponseMessage> Validate(string token)
    {
        using var client = app.Anonymous();
        return await client.PostAsJsonAsync("/api/auth/reset-password/validate", new { token });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Line_only_accounts_never_receive_a_password_reset_even_with_a_verified_contact_email(bool verified)
    {
        await app.Db(async db =>
        {
            db.Users.Add(new User { Name = "LINE account", LineUserId = "U-line-only", Email = "line-only@test.local", EmailVerified = verified });
            return await db.SaveChangesAsync();
        });
        using var client = app.Anonymous();
        var existing = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "line-only@test.local" });
        var unknown = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "unknown@test.local" });
        Assert.Equal(HttpStatusCode.Accepted, existing.StatusCode);
        Assert.Equal(existing.StatusCode, unknown.StatusCode);
        Assert.Equal(await existing.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.False(await app.Db(db => db.AuthTokens.AnyAsync(t => t.Purpose == AuthTokenPurpose.ResetPassword)));
        Assert.False(await app.Db(db => db.EmailMessages.AnyAsync(m => m.Template == "password-reset")));
    }

    [Fact]
    public async Task Email_login_with_line_linked_is_eligible_and_link_checks_do_not_consume_the_token()
    {
        var (id, oldSession) = await app.Student();
        using (oldSession)
        {
            await app.Db(async db =>
            {
                (await db.Users.FindAsync(id))!.LineUserId = "U-linked-email-account";
                return await db.SaveChangesAsync();
            });
            var email = await Email(id);
            var token = await RequestLink("  " + email.ToUpperInvariant() + "  ");
            Assert.Equal(HttpStatusCode.NoContent, (await Validate(token)).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await Validate(token)).StatusCode);
            Assert.Null(await app.Db(db => db.AuthTokens.Where(t => t.UserId == id && t.Purpose == AuthTokenPurpose.ResetPassword).Select(t => t.UsedAtUtc).SingleAsync()));
            using var reset = app.Anonymous();
            Assert.Equal(HttpStatusCode.NoContent, (await reset.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "Changed-password-2026" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Validate(token)).StatusCode);
            Assert.Equal("null", await oldSession.GetStringAsync("/api/me"));
            using var newSession = await app.Login(email, "Changed-password-2026");
            Assert.Equal(id, (await newSession.GetFromJsonAsync<JsonObject>("/api/me"))!["id"]!.GetValue<Guid>());
        }
    }

    [Fact]
    public async Task Expired_and_superseded_links_are_rejected_before_password_entry()
    {
        var (id, student) = await app.Student();
        using (student)
        {
            var email = await Email(id);
            var original = await RequestLink(email);
            app.Clock.Advance(TimeSpan.FromMinutes(2));
            var latest = await RequestLink(email);
            Assert.Equal(HttpStatusCode.BadRequest, (await Validate(original)).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await Validate(latest)).StatusCode);
            app.Clock.Advance(AccountTokens.ResetLifetime);
            Assert.Equal(HttpStatusCode.BadRequest, (await Validate(latest)).StatusCode);
            using var client = app.Anonymous();
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token = latest, password = "Cannot-use-expired" })).StatusCode);
        }
    }

    [Fact]
    public async Task A_reset_link_cannot_add_a_password_after_the_account_becomes_line_only()
    {
        var (id, student) = await app.Student();
        using (student)
        {
            var token = await RequestLink(await Email(id));
            await app.Db(async db =>
            {
                var user = (await db.Users.FindAsync(id))!;
                user.LineUserId = "U-now-line-only"; user.PasswordHash = null; user.EmailVerified = true;
                return await db.SaveChangesAsync();
            });
            Assert.Equal(HttpStatusCode.BadRequest, (await Validate(token)).StatusCode);
            using var client = app.Anonymous();
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "Cannot-enable-login" })).StatusCode);
            Assert.Null(await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.PasswordHash).SingleAsync()));
        }
    }

    [Fact]
    public async Task An_undelivered_reset_email_is_skipped_if_email_password_login_was_removed()
    {
        var (id, student) = await app.Student();
        using (student)
        using (var client = app.Anonymous())
        {
            (await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = await Email(id) })).EnsureSuccessStatusCode();
            await app.Db(async db =>
            {
                var user = (await db.Users.FindAsync(id))!;
                user.PasswordHash = null; user.LineUserId = "U-line-only-before-delivery"; user.EmailVerified = true;
                return await db.SaveChangesAsync();
            });
            await new AlertDispatcher(app.Services.GetRequiredService<IServiceScopeFactory>(), NullLogger<AlertDispatcher>.Instance).DispatchAsync(default);
            var message = await app.Db(db => db.EmailMessages.AsNoTracking().SingleAsync(m => m.Template == "password-reset"));
            Assert.Equal(EmailStatus.Skipped, message.Status);
            Assert.Equal("password_login_unavailable", message.Outcome);
            Assert.DoesNotContain(app.Email.Sent, m => m.Id == message.Id);
        }
    }

    [Fact]
    public async Task Concurrent_reset_submissions_have_one_winner_and_no_second_password_change()
    {
        var (id, student) = await app.Student();
        using (student)
        {
            var token = await RequestLink(await Email(id));
            using var first = app.Anonymous(); using var second = app.Anonymous();
            var results = await Task.WhenAll(
                first.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "First-new-password-123" }),
                second.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "Second-new-password-456" }));
            Assert.Single(results, r => r.StatusCode == HttpStatusCode.NoContent);
            Assert.Single(results, r => r.StatusCode == HttpStatusCode.BadRequest);
            Assert.Equal(1, await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.SessionVersion).SingleAsync()));
            using var signedIn = await app.Login(await Email(id), results[0].StatusCode == HttpStatusCode.NoContent ? "First-new-password-123" : "Second-new-password-456");
        }
    }

    [Fact]
    public async Task Recovery_requests_are_rate_limited_without_locking_out_normal_login()
    {
        using var client = app.Anonymous();
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "unknown@test.local" })).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "unknown@test.local" })).StatusCode);
        (await client.PostAsJsonAsync("/api/auth/login", new { email = "teacher@test.local", password = "test-teacher-Password12!" })).EnsureSuccessStatusCode();
    }
}
