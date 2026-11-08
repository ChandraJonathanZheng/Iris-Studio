using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using IrisStudio.Api.Data;
using IrisStudio.Api.Endpoints;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

// ---------- data + studio rules ----------
builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(cfg.GetConnectionString("Db")));
builder.Services.Configure<StudioOptions>(cfg.GetSection("Studio"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<StudioClock>();
builder.Services.AddScoped<AlertService>();
builder.Services.AddScoped<AvailabilityService>();
builder.Services.AddScoped<ConsentService>();
builder.Services.Configure<RetentionOptions>(cfg.GetSection("Studio:Retention"));
builder.Services.AddHostedService<RetentionService>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddSingleton<PasswordHasher<User>>();
builder.Services.AddSingleton<IAlertChannel, InAppOnlyChannel>(); // swap for a LINE push channel later
builder.Services.AddHostedService<AlertDispatcher>();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});
builder.Services.AddProblemDetails();

// ---------- auth: HttpOnly cookie (JavaScript can't read it, so XSS can't steal sessions) ----------
var auth = builder.Services.AddAuthentication(Claims.Scheme)
    .AddCookie(Claims.Scheme, o =>
    {
        o.Cookie.Name = "iris.auth";
        o.Cookie.HttpOnly = true;
        // Lax (not Strict): after LINE redirects back to us (a cross-site navigation), the browser must send the cookie.
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        o.ExpireTimeSpan = TimeSpan.FromDays(30);
        o.SlidingExpiration = true;
        // An API answers 401/403; it never redirects to an HTML login page.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });

var lineId = cfg["Line:ChannelId"];
if (!string.IsNullOrWhiteSpace(lineId))
{
    // LINE Login = OpenID Connect. New LINE users start as Pending until Iris approves them.
    auth.AddOpenIdConnect("line", o =>
    {
        o.Authority = "https://access.line.me";
        o.ClientId = lineId;
        o.ClientSecret = cfg["Line:ChannelSecret"];
        o.ResponseType = "code";
        o.UsePkce = true;
        o.CallbackPath = "/api/auth/line/callback";
        o.SignInScheme = Claims.Scheme;
        o.Scope.Clear(); o.Scope.Add("openid"); o.Scope.Add("profile");
        o.MapInboundClaims = false;
        // bot_prompt=aggressive (decided 8 Nov): LINE shows "add Iris Studio as a friend" right on the login screen.
        // Only friends of the Official Account can receive LINE push messages, so this is what makes LINE alerts work.
        // Needs the Official Account linked to this LINE Login channel in the LINE Developers console.
        o.Events.OnRedirectToIdentityProvider = ctx => { ctx.ProtocolMessage.SetParameter("bot_prompt", "aggressive"); return Task.CompletedTask; };
        o.Events.OnRemoteFailure = ctx => { ctx.Response.Redirect("/login?error=line"); ctx.HandleResponse(); return Task.CompletedTask; };
        o.Events.OnTicketReceived = async ctx =>
        {
            var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var sub = ctx.Principal!.FindFirstValue("sub")!;
            var user = await db.Users.FirstOrDefaultAsync(u => u.LineUserId == sub);
            if (user is null)
            {
                user = new User { Name = ctx.Principal.FindFirstValue("name") ?? "LINE 使用者", LineUserId = sub, AvatarUrl = ctx.Principal.FindFirstValue("picture") };
                db.Users.Add(user);
                await db.SaveChangesAsync();
            }
            ctx.Principal = Claims.For(user); // our own claims (user id + role), not LINE's
            ctx.ReturnUri = user.Status == UserStatus.Pending ? "/pending" : user.Role == Role.Teacher ? "/teacher" : (ctx.ReturnUri is "/login" or null ? "/app" : ctx.ReturnUri);
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
    o.AddPolicy("consult", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

app.UseProblemHandler();
app.UseDefaultFiles();
app.UseStaticFiles(); // the built React app lives in wwwroot (one deploy, one domain, no CORS)
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapPublicAndAuth();
app.MapSlotsAndStudent();
app.MapTeacher();
app.MapTeacherProfile();
app.MapPrivacy();

// Unknown /api paths are real 404s; everything else is a React route.
app.MapFallback("/api/{**rest}", () => Problems.Of(404, "not_found", "找不到這個 API。"));
app.MapFallbackToFile("index.html");

await Seed.RunAsync(app.Services, demo: app.Environment.IsDevelopment());
app.Run();

public partial class Program { }
