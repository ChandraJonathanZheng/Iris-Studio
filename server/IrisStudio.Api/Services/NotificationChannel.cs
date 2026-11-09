using System.Net;
using System.Net.Http.Headers;
using IrisStudio.Api.Data;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

public sealed class NotificationOptions
{
    public bool Enabled { get; set; }
    public string EmailProvider { get; set; } = "Resend";
    public string ResendApiKey { get; set; } = "";
    public string FromEmail { get; set; } = "";
    /// <summary>Public site address for links in emails, e.g. https://iris-studio.tw (no trailing slash needed).</summary>
    public string BaseUrl { get; set; } = "";
    /// <summary>Shown in every email footer. Empty = not shown.</summary>
    public string ContactEmail { get; set; } = "";
    public string ContactLine { get; set; } = "";
    public SmtpOptions Smtp { get; set; } = new();
}

/// <summary>
/// In-app alerts are also pushed to LINE for LINE-linked users. Email is a separate outbox (EmailMessage, sent by
/// EmailDelivery with HTML templates), so LINE users who also have an email get both.
/// </summary>
public sealed class NotificationChannel(IHttpClientFactory clients, IConfiguration config, IOptions<NotificationOptions> options) : IAlertChannel
{
    public async Task SendAsync(User user, Alert alert, CancellationToken ct)
    {
        if (!options.Value.Enabled || user.LineUserId is null) return;
        var token = config["Line:MessagingAccessToken"];
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("LINE MessagingAccessToken is not configured.");
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.line.me/v2/bot/message/push");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("X-Line-Retry-Key", alert.Id.ToString());
        request.Content = JsonContent.Create(new { to = user.LineUserId, messages = new[] { new { type = "text", text = $"{alert.Title}\n{alert.Body}" } } });
        using var response = await clients.CreateClient("notifications").SendAsync(request, ct);
        // LINE acknowledges a previously accepted retry key with 409 and this header.
        if (response.StatusCode == HttpStatusCode.Conflict && response.Headers.Contains("x-line-accepted-request-id")) return;
        response.EnsureSuccessStatusCode();
    }
}

/// <summary>Resend API. The Idempotency-Key makes a retried outbox row deliver once.</summary>
public sealed class ResendEmailSender(IHttpClientFactory clients, IOptions<NotificationOptions> options) : IEmailSender
{
    public async Task SendAsync(OutgoingEmail email, CancellationToken ct)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.ResendApiKey) || string.IsNullOrWhiteSpace(o.FromEmail))
            throw new InvalidOperationException("ResendApiKey and FromEmail are not configured.");
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", o.ResendApiKey);
        request.Headers.Add("Idempotency-Key", $"iris-email/{email.Id}");
        request.Content = JsonContent.Create(new
        {
            from = $"{o.Smtp.FromName} <{o.FromEmail}>",
            to = new[] { email.To },
            subject = email.Subject,
            html = email.Html,
            text = email.Text,
            headers = email.Headers,
        });
        using var response = await clients.CreateClient("notifications").SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
    }
}
