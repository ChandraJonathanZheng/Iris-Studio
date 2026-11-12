using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using IrisStudio.Api.Data;
using IrisStudio.Api.Endpoints;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

// ---------- data + studio rules ----------
switch (cfg.GetValue("Database:Provider", "PostgreSql"))
{
    case "SqlServer":
        builder.Services.AddDbContext<AppDbContext, SqlServerDbContext>(o => o.UseSqlServer(cfg.GetConnectionString("Db")));
        break;
    case "PostgreSql":
        builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(cfg.GetConnectionString("Db")));
        break;
    default:
        throw new InvalidOperationException("Set Database:Provider to SqlServer or PostgreSql.");
}
builder.Services.Configure<StudioOptions>(cfg.GetSection("Studio"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<StudioClock>();
builder.Services.AddScoped<AlertService>();
builder.Services.AddScoped<AvailabilityService>();
builder.Services.AddScoped<ConsentService>();
builder.Services.AddScoped<LineLogin>();
builder.Services.AddSingleton<JwtSession>();
builder.Services.Configure<RetentionOptions>(cfg.GetSection("Studio:Retention"));
builder.Services.AddScoped<BookingService>();
builder.Services.AddSingleton<PasswordHasher<User>>();
builder.Services.AddScoped<ReceiptStorage>();
builder.Services.Configure<NotificationOptions>(cfg.GetSection("Notifications"));
builder.Services.AddSingleton<ISmtpClientFactory, SmtpClientFactory>();
builder.Services.AddSingleton<SmtpEmailSender>();
builder.Services.AddSingleton<ResendEmailSender>();
var emailProvider = cfg.GetValue("Notifications:EmailProvider", "Resend")!;
builder.Services.AddSingleton<IEmailSender>(sp => emailProvider.ToLowerInvariant() switch
{
    "smtp" => sp.GetRequiredService<SmtpEmailSender>(),
    "resend" => sp.GetRequiredService<ResendEmailSender>(),
    _ => throw new InvalidOperationException("Notifications:EmailProvider must be Smtp or Resend."),
});
builder.Services.AddSingleton<EmailRenderer>();
builder.Services.AddSingleton<UnsubscribeLinks>();
builder.Services.AddScoped<EmailDelivery>();
builder.Services.AddScoped<AccountTokens>();
builder.Services.AddHttpClient("notifications", c => c.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddSingleton<IAlertChannel, NotificationChannel>();
if (cfg.GetValue("Studio:RunBackgroundJobs", true))
{
    builder.Services.AddHostedService<RetentionService>();
    builder.Services.AddHostedService<AlertDispatcher>();
    builder.Services.AddHostedService<StudioMaintenance>();
}
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "App_Data", "keys")));
builder.Services.Configure<FormOptions>(o => { o.MultipartBodyLengthLimit = ImageService.MaxBytes; o.ValueLengthLimit = 2000; });
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = ImageService.MaxBytes + 1024 * 1024);
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});
builder.Services.AddProblemDetails();

// ---------- auth: signed application JWT, carried by an HttpOnly same-origin cookie or a Bearer header ----------
var auth = builder.Services.AddAuthentication(Claims.Scheme)
    .AddJwtBearer(Claims.Scheme, o =>
    {
        o.MapInboundClaims = false;
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                // An explicit Authorization header takes precedence over a browser session.
                if (!ctx.Request.Headers.ContainsKey("Authorization"))
                    ctx.Token = ctx.Request.Cookies[JwtSession.CookieName];
                return Task.CompletedTask;
            },
            OnTokenValidated = async ctx =>
            {
                var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var id = ctx.Principal?.FindFirstValue("sub");
                var user = Guid.TryParse(id, out var uid) ? await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == uid, ctx.HttpContext.RequestAborted) : null;
                if (user is null || user.Declined || !ctx.Principal!.IsInRole(user.Role.ToString()) || !JwtSession.IsCurrent(ctx.Principal, user))
                {
                    ctx.Fail("The user no longer has access to this session.");
                    ctx.HttpContext.RequestServices.GetRequiredService<JwtSession>().SignOut(ctx.HttpContext);
                    return;
                }
                ctx.Principal = Claims.For(user);
            },
        };
    });
builder.Services.AddOptions<JwtBearerOptions>(Claims.Scheme).Configure<JwtSession>((options, sessions) =>
    options.TokenValidationParameters = sessions.ValidationParameters);

var lineId = cfg["Line:ChannelId"];
if (!string.IsNullOrWhiteSpace(lineId) && !string.IsNullOrWhiteSpace(cfg["Line:ChannelSecret"]))
{
    // LINE verifies its own tokens; OnTicketReceived persists the local user and issues our JWT.
    auth.AddOpenIdConnect("line", o =>
    {
        o.Authority = "https://access.line.me";
        o.ClientId = lineId;
        o.ClientSecret = cfg["Line:ChannelSecret"];
        o.ResponseType = "code";
        o.ResponseMode = "query";
        o.UsePkce = true;
        o.CallbackPath = "/api/auth/line/callback";
        o.SignInScheme = Claims.Scheme; // OnTicketReceived handles issuance; no SignInAsync on the Bearer handler.
        o.Scope.Clear(); o.Scope.Add("openid"); o.Scope.Add("profile");
        o.MapInboundClaims = false;
        // LINE signs web-login ID tokens with HS256 using the channel secret (no "kid"); its JWKS (ES256) only covers
        // native/LIFF tokens. Without this key, validation fails with IDX10517. JWKS keys are still added by the handler.
        o.TokenValidationParameters.IssuerSigningKeys =
            [new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(cfg["Line:ChannelSecret"]!))];
        o.TokenValidationParameters.ValidAlgorithms = [SecurityAlgorithms.HmacSha256];
        // bot_prompt=aggressive (decided 8 Nov): LINE shows "add Iris Studio as a friend" right on the login screen.
        // Only friends of the Official Account can receive LINE push messages, so this is what makes LINE alerts work.
        // Needs the Official Account linked to this LINE Login channel in the LINE Developers console.
        o.Events.OnRedirectToIdentityProvider = ctx => { ctx.ProtocolMessage.SetParameter("bot_prompt", "aggressive"); return Task.CompletedTask; };
        o.Events.OnRemoteFailure = ctx =>
        {
            ctx.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>().LogWarning(ctx.Failure, "LINE login callback failed.");
            var correlation = ctx.Failure?.Message.Contains("Correlation", StringComparison.OrdinalIgnoreCase) == true;
            ctx.Response.Redirect(correlation ? "/login?error=line_session" : "/login?error=line");
            ctx.HandleResponse();
            return Task.CompletedTask;
        };
        o.Events.OnTicketReceived = async ctx =>
        {
            var principal = ctx.Principal ?? throw new InvalidOperationException("LINE identity is missing.");
            var user = await ctx.HttpContext.RequestServices.GetRequiredService<LineLogin>().FindOrCreateAsync(principal, ctx.HttpContext.RequestAborted);
            if (user.Declined)
            {
                ctx.Response.Redirect("/login?error=declined");
                ctx.HandleResponse();
                return;
            }
            ctx.HttpContext.RequestServices.GetRequiredService<JwtSession>().SignIn(ctx.HttpContext, user);
            ctx.Response.Redirect(LineLogin.Destination(user, ctx.ReturnUri));
            ctx.HandleResponse();
        };
    });
}

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Student", p => p.RequireRole(nameof(Role.Student)))
    .AddPolicy("Teacher", p => p.RequireRole(nameof(Role.Teacher)));

// ---------- rate limits: public consult form (PRD WEB-4) and login ----------
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.OnRejected = async (ctx, ct) => await Problems.Of(429, "rate_limited", "操作太頻繁，請稍後再試。").ExecuteAsync(ctx.HttpContext);
    o.AddPolicy("consult", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("password-recovery", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("password-reset", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();
_ = app.Services.GetRequiredService<JwtSession>(); // Fail at startup if the signing key is absent or too short.
_ = app.Services.GetRequiredService<IEmailSender>(); // ...or the email provider name is wrong.
if (cfg.GetValue<bool>("Notifications:Enabled") && string.IsNullOrWhiteSpace(cfg["Notifications:BaseUrl"]))
    throw new InvalidOperationException("Set Notifications:BaseUrl (the public site address used in email links) or disable Notifications.");

// Behind a TLS-terminating proxy (dev tunnel, reverse proxy) the app only sees http://localhost. Without this the OIDC
// redirect_uri would be http://… and LINE would reject it. Only loopback proxies are trusted (ASP.NET default).
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor
                     | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
                     | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedHost,
});

app.UseProblemHandler();
app.UseSameOriginWrites();
app.UseStatusCodePages(async ctx =>
{
    if (ctx.HttpContext.Request.Path.StartsWithSegments("/api"))
        await Problems.Of(ctx.HttpContext.Response.StatusCode, "http_error", "請求無法完成，請重新登入或稍後再試。").ExecuteAsync(ctx.HttpContext);
});
app.UseDefaultFiles();
app.UseStaticFiles(); // the built React app lives in wwwroot (one deploy, one domain, no CORS)
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapPublicAndAuth();
app.MapSlotsAndStudent();
app.MapTeacher();
app.MapTeacherProfile();
app.MapReels();
app.MapPrivacy();
if (app.Environment.IsDevelopment()) app.MapEmailPreviews(); // /api/dev/emails — never in production

// Unknown /api paths are real 404s; everything else is a React route.
app.MapFallback("/api/{**rest}", () => Problems.Of(404, "not_found", "找不到這個 API。"));
app.MapFallbackToFile("index.html");

await Seed.RunAsync(app.Services, demo: app.Environment.IsDevelopment() && cfg.GetValue<bool>("Studio:SeedDemo"));
app.Run();

public partial class Program { }
