using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using IrisStudio.Api.Data;
using Microsoft.IdentityModel.Tokens;

namespace IrisStudio.Api.Services;

/// <summary>Application JWTs belong to Iris users, never to the external LINE identity.</summary>
public sealed class JwtSession
{
    public const string CookieName = "iris.auth";
    /// <summary>User.SessionVersion at sign-in. Tokens issued before this claim existed count as version 0.</summary>
    public const string SessionVersionClaim = "sv";

    public static bool IsCurrent(System.Security.Claims.ClaimsPrincipal principal, User user) =>
        (principal.FindFirst(SessionVersionClaim)?.Value ?? "0") == user.SessionVersion.ToString();
    private readonly SigningCredentials _credentials;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly TimeSpan _lifetime;
    private readonly bool _requireHttps;

    public JwtSession(IConfiguration config, IWebHostEnvironment environment)
    {
        var secret = config["Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
            throw new InvalidOperationException("Set Jwt:SigningKey to a random secret of at least 32 bytes using user-secrets or Jwt__SigningKey.");
        _credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256);
        _issuer = config.GetValue("Jwt:Issuer", "iris-studio")!;
        _audience = config.GetValue("Jwt:Audience", "iris-studio-web")!;
        var days = config.GetValue("Jwt:LifetimeDays", 30);
        if (days is < 1 or > 30) throw new InvalidOperationException("Jwt:LifetimeDays must be between 1 and 30.");
        _lifetime = TimeSpan.FromDays(days);
        _requireHttps = !environment.IsDevelopment();
    }

    public TokenValidationParameters ValidationParameters => new()
    {
        ValidateIssuer = true,
        ValidIssuer = _issuer,
        ValidateAudience = true,
        ValidAudience = _audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = _credentials.Key,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ValidateLifetime = true,
        RequireExpirationTime = true,
        RequireSignedTokens = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = "name",
        RoleClaimType = "role",
    };

    public string SignIn(HttpContext http, User user)
    {
        // Authentication uses real UTC time, independently of the injectable studio lesson clock.
        var now = DateTime.UtcNow;
        var expires = now.Add(_lifetime);
        var jwt = new JwtSecurityToken(_issuer, _audience,
            [new Claim("sub", user.Id.ToString()), new Claim("name", user.Name),
             new Claim("role", user.Role.ToString()), new Claim("jti", Guid.NewGuid().ToString("N")),
             new Claim(SessionVersionClaim, user.SessionVersion.ToString())],
            now, expires, _credentials);
        var token = new JwtSecurityTokenHandler().WriteToken(jwt);
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Cookies.Append(CookieName, token, Cookie(http, expires));
        return token;
    }

    public void SignOut(HttpContext http)
    {
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Cookies.Delete(CookieName, Cookie(http));
    }

    private CookieOptions Cookie(HttpContext http, DateTimeOffset? expires = null) => new()
    {
        HttpOnly = true,
        Secure = _requireHttps || http.Request.IsHttps,
        SameSite = SameSiteMode.Lax,
        Path = "/",
        IsEssential = true,
        Expires = expires,
    };
}
