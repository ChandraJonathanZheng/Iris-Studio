using System.Net;
using System.Text.Json.Nodes;
using IrisStudio.Api.Data;
using IrisStudio.Api.Infrastructure;
using IrisStudio.Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Tests;

public class NotificationTests
{
    private sealed class RecordingHttp(HttpStatusCode status = HttpStatusCode.OK, bool acceptedRetry = false) : HttpMessageHandler, IHttpClientFactory
    {
        public Uri? Uri { get; private set; }
        public JsonNode? Body { get; private set; }
        public Dictionary<string, string> Headers { get; } = [];
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Uri = request.RequestUri;
            Body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct));
            foreach (var header in request.Headers) Headers[header.Key] = string.Join(',', header.Value);
            var response = new HttpResponseMessage(status);
            if (acceptedRetry) response.Headers.Add("x-line-accepted-request-id", "accepted-id");
            return response;
        }
    }
    private static NotificationChannel Channel(RecordingHttp http, bool enabled = true) => new(http,
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Line:MessagingAccessToken"] = "test-line-token" }).Build(),
        Options.Create(new NotificationOptions { Enabled = enabled }));
    private static Alert Message() => new() { UserId = Guid.NewGuid(), Kind = AlertKind.Payment, Title = "付款已確認", Body = "4 堂已加入。" };

    [Fact]
    public async Task Line_delivery_uses_stable_retry_key()
    {
        using var http = new RecordingHttp(); var alert = Message();
        await Channel(http).SendAsync(new User { Name = "學生", LineUserId = "U123", Email = "student@test.local" }, alert, default);
        Assert.Equal("https://api.line.me/v2/bot/message/push", http.Uri!.ToString());
        Assert.Equal("Bearer test-line-token", http.Headers["Authorization"]);
        Assert.Equal(alert.Id.ToString(), http.Headers["X-Line-Retry-Key"]);
        Assert.Equal("U123", http.Body!["to"]!.GetValue<string>());
        Assert.Contains(alert.Body, http.Body["messages"]![0]!["text"]!.GetValue<string>());
    }

    [Theory]
    [InlineData(null, true)]   // email-only users: email goes through the email outbox, not this channel
    [InlineData("U123", false)] // delivery disabled
    public async Task Alert_channel_only_pushes_to_linked_line_users_when_enabled(string? lineId, bool enabled)
    {
        using var http = new RecordingHttp();
        await Channel(http, enabled).SendAsync(new User { Name = "學生", Email = "student@test.local", LineUserId = lineId }, Message(), default);
        Assert.Null(http.Uri);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Line_409_only_counts_as_delivered_when_provider_confirms_retry_key(bool accepted)
    {
        using var http = new RecordingHttp(HttpStatusCode.Conflict, accepted);
        var send = () => Channel(http).SendAsync(new User { Name = "學生", LineUserId = "U123" }, Message(), default);
        if (accepted) await send(); else await Assert.ThrowsAsync<HttpRequestException>(send);
    }

    [Fact]
    public async Task Resend_email_has_idempotency_key_html_text_and_headers()
    {
        using var http = new RecordingHttp();
        var sender = new ResendEmailSender(http, Options.Create(new NotificationOptions { ResendApiKey = "test-resend-key", FromEmail = "studio@test.local" }));
        var email = new OutgoingEmail(Guid.NewGuid(), "student@test.local", "付款已確認", "<p>4 堂已加入。</p>", "4 堂已加入。",
            new Dictionary<string, string> { ["List-Unsubscribe"] = "<https://iris.test/u>" });
        await sender.SendAsync(email, default);
        Assert.Equal("https://api.resend.com/emails", http.Uri!.ToString());
        Assert.Equal($"iris-email/{email.Id}", http.Headers["Idempotency-Key"]);
        Assert.Equal("student@test.local", http.Body!["to"]![0]!.GetValue<string>());
        Assert.Equal(email.Html, http.Body["html"]!.GetValue<string>());
        Assert.Equal(email.Text, http.Body["text"]!.GetValue<string>());
        Assert.Equal("<https://iris.test/u>", http.Body["headers"]!["List-Unsubscribe"]!.GetValue<string>());
    }

    [Theory]
    [InlineData("/app", true)]
    [InlineData("//evil.example", false)]
    [InlineData("/\evil.example", false)]
    [InlineData("/app\n", false)]
    [InlineData("https://evil.example", false)]
    public void Line_return_url_stays_on_the_same_site(string url, bool valid) => Assert.Equal(valid, Input.IsLocalUrl(url));
}
