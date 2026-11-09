using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace IrisStudio.Api.Services;

public sealed class SmtpOptions
{
    public string Host { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromName { get; set; } = "Iris Studio";
}

/// <summary>A rendered email ready for a provider. Headers carry e.g. List-Unsubscribe for marketing.</summary>
public sealed record OutgoingEmail(Guid Id, string To, string Subject, string Html, string Text, IReadOnlyDictionary<string, string> Headers);

public interface IEmailSender
{
    Task SendAsync(OutgoingEmail email, CancellationToken ct);
}

public interface ISmtpClientFactory
{
    ISmtpClient CreateClient();
}

public sealed class SmtpClientFactory : ISmtpClientFactory
{
    public ISmtpClient CreateClient() => new SmtpClient();
}

/// <summary>One authenticated TLS connection per email; delivery errors propagate to the outbox for retry.</summary>
public sealed class SmtpEmailSender(IOptions<NotificationOptions> options, ISmtpClientFactory clients) : IEmailSender
{
    public async Task SendAsync(OutgoingEmail email, CancellationToken ct)
    {
        var o = options.Value;
        var smtp = o.Smtp;
        if (string.IsNullOrWhiteSpace(smtp.Host) || smtp.Port is < 1 or > 65535 || string.IsNullOrWhiteSpace(smtp.Username))
            throw new InvalidOperationException("Configure Notifications:Smtp:Host, Port, and Username.");
        if (string.IsNullOrWhiteSpace(smtp.Password))
            throw new InvalidOperationException("Set Notifications:Smtp:Password using user-secrets or Notifications__Smtp__Password. Gmail requires an App Password.");
        if (!MailboxAddress.TryParse(o.FromEmail, out var from) || !MailboxAddress.TryParse(email.To, out var to))
            throw new InvalidOperationException("The notification sender and recipient must be valid email addresses.");

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(smtp.FromName, from.Address));
        message.To.Add(to);
        message.Subject = email.Subject;
        // multipart/alternative: clients that can't show HTML show the plain-text version
        message.Body = new BodyBuilder { TextBody = email.Text, HtmlBody = email.Html }.ToMessageBody();
        message.MessageId = $"iris-email.{email.Id:N}@{from.Address[(from.Address.LastIndexOf('@') + 1)..]}";
        message.Headers.Add("X-Iris-Email-Id", email.Id.ToString());
        foreach (var (name, value) in email.Headers) message.Headers.Add(name, value);

        using var client = clients.CreateClient();
        client.Timeout = 15_000;
        // Port 465 starts TLS immediately. Other ports require STARTTLS; plaintext fallback is never allowed.
        await client.ConnectAsync(smtp.Host, smtp.Port, smtp.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls, ct);
        client.AuthenticationMechanisms.Remove("XOAUTH2");
        client.AuthenticationMechanisms.Remove("OAUTHBEARER");
        await client.AuthenticateAsync(smtp.Username, smtp.Password, ct);
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
    }
}
