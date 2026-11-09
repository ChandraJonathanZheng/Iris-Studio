using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using IrisStudio.Api.Data;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace IrisStudio.Api.Tests;

public sealed class LineFactory : StudioFactory
{
    protected override bool UseLineLogin => true;
    public const string ChannelId = "test-line-channel";
    public const string ChannelSecret = "test-line-channel-secret-32-bytes";
    public LineBackchannel Provider { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Host settings make LINE registration independent of any real credentials in appsettings or user-secrets.
        builder.UseSetting("Line:ChannelId", ChannelId);
        builder.UseSetting("Line:ChannelSecret", ChannelSecret);
        base.ConfigureWebHost(builder);
        builder.ConfigureTestServices(services => services.PostConfigure<OpenIdConnectOptions>("line", options =>
        {
            var configuration = new OpenIdConnectConfiguration
            {
                Issuer = "https://access.line.me",
                AuthorizationEndpoint = "https://access.line.me/oauth2/v2.1/authorize",
                TokenEndpoint = "https://api.line.me/oauth2/v2.1/token",
            };
            // LINE's discovery advertises ES256 JWKS. Web tokens must still validate with the configured channel secret.
            options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
            options.Backchannel = new HttpClient(Provider);
        }));
    }
}

public sealed class LineBackchannel : HttpMessageHandler
{
    public string Nonce { get; set; } = "";
    public string Subject { get; set; } = "U-line-test-user";
    public bool InvalidSignature { get; set; }
    public bool InvalidNonce { get; set; }
    public string? RedirectUri { get; private set; }
    public bool HasPkceVerifier { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Assert.Equal("https://api.line.me/oauth2/v2.1/token", request.RequestUri!.AbsoluteUri);
        var fields = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));
        Assert.Equal(LineFactory.ChannelId, fields["client_id"].ToString());
        Assert.Equal(LineFactory.ChannelSecret, fields["client_secret"].ToString());
        RedirectUri = fields["redirect_uri"];
        HasPkceVerifier = fields["code_verifier"].ToString().Length > 0;
        var key = InvalidSignature ? "a-different-channel-secret-32-bytes" : LineFactory.ChannelSecret;
        var now = DateTime.UtcNow;
        var jwt = new JwtSecurityToken("https://access.line.me", LineFactory.ChannelId,
            [new Claim("sub", Subject), new Claim("nonce", InvalidNonce ? "wrong-nonce" : Nonce),
             new Claim("name", "LINE Student"), new Claim("picture", "https://example.com/avatar.png"),
             new Claim("iat", new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)],
            now, now.AddMinutes(10), new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256));
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { access_token = "stub-line-access-token", token_type = "Bearer", expires_in = 3600,
                id_token = new JwtSecurityTokenHandler().WriteToken(jwt) }),
        };
    }
}

public sealed class LineLoginTests(LineFactory app) : IClassFixture<LineFactory>, IAsyncLifetime
{
    private const string Origin = "https://k4kr4s5z-5173.jpe1.devtunnels.ms";
    public async Task InitializeAsync()
    {
        await app.ResetAsync();
        app.Provider.Subject = "U-line-test-user";
        app.Provider.InvalidSignature = app.Provider.InvalidNonce = false;
    }
    public Task DisposeAsync() => Task.CompletedTask;

    private HttpClient Client() => app.CreateClient(new() { BaseAddress = new Uri(Origin), AllowAutoRedirect = false });

    private async Task<HttpResponseMessage> Login(HttpClient client, string returnUrl = "/app")
    {
        var start = await client.GetAsync("/api/auth/line?returnUrl=" + Uri.EscapeDataString(returnUrl));
        Assert.Equal(HttpStatusCode.Redirect, start.StatusCode);
        var query = QueryHelpers.ParseQuery(start.Headers.Location!.Query);
        Assert.Equal(Origin + "/api/auth/line/callback", query["redirect_uri"].ToString());
        Assert.Equal("S256", query["code_challenge_method"].ToString());
        app.Provider.Nonce = query["nonce"]!;
        return await client.GetAsync("/api/auth/line/callback?code=stub-code&state=" + Uri.EscapeDataString(query["state"]!));
    }

    [Fact]
    public async Task Hs256_web_callback_persists_user_issues_app_jwt_and_me_reads_the_same_user()
    {
        using var client = Client();
        var callback = await Login(client);
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Equal("/pending", callback.Headers.Location!.OriginalString);
        var cookie = callback.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("iris.auth="));
        Assert.Contains("httponly", cookie); Assert.Contains("secure", cookie); Assert.Contains("samesite=lax", cookie);
        var token = cookie.Split(';')[0]["iris.auth=".Length..];
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("iris-studio", jwt.Issuer);
        Assert.Equal(SecurityAlgorithms.HmacSha256, jwt.Header.Alg);
        Assert.Equal("Student", jwt.Claims.Single(c => c.Type == "role").Value);
        var me = (await client.GetFromJsonAsync<JsonObject>("/api/me"))!;
        var id = me["id"]!.GetValue<Guid>();
        Assert.Equal(id.ToString(), jwt.Subject);
        Assert.Equal("LINE Student", me["name"]!.GetValue<string>());
        Assert.Equal("Pending", me["status"]!.GetValue<string>());
        Assert.Equal(app.Provider.Subject, await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.LineUserId).SingleAsync()));
        Assert.Equal(Origin + "/api/auth/line/callback", app.Provider.RedirectUri);
        Assert.True(app.Provider.HasPkceVerifier);

        // Both HTTP transports accept the same signed app token, with no LINE token stored in the browser.
        using var bearer = Client();
        bearer.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(id, (await bearer.GetFromJsonAsync<JsonObject>("/api/me"))!["id"]!.GetValue<Guid>());
        Assert.Equal("no-store", (await client.GetAsync("/api/me")).Headers.CacheControl!.ToString());
        (await client.PostAsync("/api/auth/logout", null)).EnsureSuccessStatusCode();
        Assert.Equal("null", await client.GetStringAsync("/api/me"));
    }

    [Fact]
    public async Task Existing_active_user_reuses_database_profile_and_enters_dashboard_without_duplicates()
    {
        using var first = Client();
        await Login(first);
        var id = await app.Db(async db =>
        {
            var user = await db.Users.SingleAsync(u => u.LineUserId == app.Provider.Subject);
            user.Status = UserStatus.Active;
            user.Name = "Studio profile name";
            await db.SaveChangesAsync();
            return user.Id;
        });
        using var again = Client();
        var callback = await Login(again, "/app/calendar");
        Assert.Equal("/app/calendar", callback.Headers.Location!.OriginalString);
        var me = (await again.GetFromJsonAsync<JsonObject>("/api/me"))!;
        Assert.Equal(id, me["id"]!.GetValue<Guid>());
        Assert.Equal("Studio profile name", me["name"]!.GetValue<string>());
        Assert.Single(await app.Db(db => db.Users.Where(u => u.LineUserId == app.Provider.Subject).ToListAsync()));
        Assert.Equal(HttpStatusCode.OK, (await again.GetAsync("/api/student/payments")).StatusCode);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Invalid_line_signature_or_nonce_cannot_create_a_user_or_a_session(bool signature, bool nonce)
    {
        app.Provider.InvalidSignature = signature;
        app.Provider.InvalidNonce = nonce;
        using var client = Client();
        var callback = await Login(client);
        Assert.Equal("/login?error=line", callback.Headers.Location!.OriginalString);
        Assert.False(await app.Db(db => db.Users.AnyAsync(u => u.LineUserId == app.Provider.Subject)));
        Assert.Equal("null", await client.GetStringAsync("/api/me"));
    }

    [Fact]
    public async Task Callback_requires_original_state_cookie_and_declined_users_receive_no_jwt()
    {
        using var client = Client();
        var start = await client.GetAsync("/api/auth/line");
        var query = QueryHelpers.ParseQuery(start.Headers.Location!.Query);
        using var differentBrowser = Client();
        var missingCookie = await differentBrowser.GetAsync("/api/auth/line/callback?code=stub&state=" + Uri.EscapeDataString(query["state"]!));
        Assert.Equal("/login?error=line_session", missingCookie.Headers.Location!.OriginalString);
        await Login(client);
        await app.Db(async db =>
        {
            var user = await db.Users.SingleAsync(u => u.LineUserId == app.Provider.Subject);
            user.Declined = true;
            return await db.SaveChangesAsync();
        });
        using var declined = Client();
        var callback = await Login(declined);
        Assert.Equal("/login?error=declined", callback.Headers.Location!.OriginalString);
        Assert.Equal("null", await declined.GetStringAsync("/api/me"));
        Assert.Equal("null", await client.GetStringAsync("/api/me"));
    }
}
