using System.Security.Claims;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Infrastructure;

public static class Problems
{
    /// <summary>RFC 7807 problem details plus a stable `code` the client can branch on.</summary>
    public static IResult Of(int status, string code, string detail) =>
        Results.Problem(statusCode: status, title: detail, detail: detail, extensions: new Dictionary<string, object?> { ["code"] = code });

    public static IResult From(BizException ex) => Of(ex.Status, ex.Code, ex.Message);

    /// <summary>Turns BizException into 4xx, anything else into a generic 500 without a stack trace.</summary>
    public static void UseProblemHandler(this WebApplication app) =>
        app.UseExceptionHandler(e => e.Run(async ctx =>
        {
            var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
            var result = ex is BizException b ? From(b)
                : ex is BadHttpRequestException ? Of(400, "bad_request", "請求格式不正確。")
                : Of(500, "server_error", "伺服器發生錯誤，請稍後再試。");
            if (ex is not BizException and not BadHttpRequestException)
                ctx.RequestServices.GetRequiredService<ILogger<Program>>().LogError(ex, "Unhandled error");
            await result.ExecuteAsync(ctx);
        }));
}

public static class Claims
{
    public const string Scheme = "iris";
    public static Guid UserId(this ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static ClaimsPrincipal For(User u) => new(new ClaimsIdentity(
        [new Claim(ClaimTypes.NameIdentifier, u.Id.ToString()), new Claim(ClaimTypes.Name, u.Name), new Claim(ClaimTypes.Role, u.Role.ToString())], Scheme));
}

/// <summary>
/// Student endpoints check Status = Active FROM THE DATABASE on every call (not from the cookie),
/// so Iris's approval works instantly without logging in again, and a removed student is locked out instantly.
/// </summary>
public class ActiveStudentFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        var db = http.RequestServices.GetRequiredService<AppDbContext>();
        var id = http.User.UserId();
        var ok = await db.Users.AnyAsync(u => u.Id == id && u.Role == Role.Student && u.Status == UserStatus.Active && !u.Declined);
        return ok ? await next(ctx) : Problems.Of(403, "pending", "帳號還在等待老師確認。");
    }
}
