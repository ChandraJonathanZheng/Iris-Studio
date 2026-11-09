using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.IdentityModel.Tokens;

namespace IrisStudio.Api.Tests;

public sealed class JwtSessionTests(StudioFactory app) : IClassFixture<StudioFactory>, IAsyncLifetime
{
    public Task InitializeAsync() => app.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Password_login_issues_the_same_jwt_for_cookie_and_bearer_access()
    {
        using var browser = app.Anonymous();
        var login = await browser.PostAsJsonAsync("/api/auth/login", new { email = "teacher@test.local", password = "test-teacher-Password12!" });
        login.EnsureSuccessStatusCode();
        var cookie = login.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("iris.auth="));
        var token = cookie.Split(';')[0]["iris.auth=".Length..];
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        var me = (await browser.GetFromJsonAsync<JsonObject>("/api/me"))!;
        Assert.Equal(me["id"]!.GetValue<Guid>().ToString(), jwt.Subject);
        using var bearer = app.Anonymous();
        bearer.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.OK, (await bearer.GetAsync("/api/teacher/overview")).StatusCode);

        // Invalid explicit Bearer credentials must not fall back to a valid browser cookie.
        browser.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "invalid");
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/teacher/overview")).StatusCode);
    }

    [Theory]
    [InlineData("expired")]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("signature")]
    [InlineData("subject")]
    [InlineData("role")]
    public async Task Invalid_application_jwts_cannot_access_dashboard_apis(string invalid)
    {
        using var signedIn = await app.Login();
        var me = (await signedIn.GetFromJsonAsync<JsonObject>("/api/me"))!;
        var now = DateTime.UtcNow;
        var secret = invalid == "signature" ? "another-signing-key-with-at-least-32-bytes" : StudioFactory.JwtSigningKey;
        var jwt = new JwtSecurityToken(invalid == "issuer" ? "other-issuer" : "iris-studio",
            invalid == "audience" ? "other-audience" : "iris-studio-web",
            [new Claim("sub", invalid == "subject" ? "invalid-guid" : me["id"]!.GetValue<Guid>().ToString()),
             new Claim("role", invalid == "role" ? "Student" : "Teacher")],
            now.AddHours(-2), invalid == "expired" ? now.AddHours(-1) : now.AddHours(1),
            new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256));
        using var client = app.Anonymous();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(jwt));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/teacher/overview")).StatusCode);
        Assert.Equal("null", await client.GetStringAsync("/api/me"));
    }
}
