using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using MailKit.Net.Smtp;
using Microsoft.Extensions.Options;
using MimeKit;

namespace IrisStudio.Api.Tests;

public sealed class SmtpEmailTests
{
    private sealed class ClientFactory(Func<ISmtpClient> create) : ISmtpClientFactory
    {
        public int Created { get; private set; }
        public ISmtpClient CreateClient() { Created++; return create(); }
    }

    /// <summary>A local SMTP server with real STARTTLS; no messages leave the test process.</summary>
    private sealed class SmtpServer : IAsyncDisposable
    {
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource _stop = new(TimeSpan.FromSeconds(15));
        private readonly X509Certificate2 _certificate;
        public int Port { get; }
        public Task Run { get; }
        public string? Username { get; private set; }
        public string? Password { get; private set; }
        public MimeMessage? Message { get; private set; }
        public bool AuthenticatedOverTls { get; private set; }
        public SmtpServer(bool tls = true, bool rejectAuth = false)
        {
            using var rsa = RSA.Create(2048);
            var request = new CertificateRequest("CN=localhost", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
            // Windows Schannel requires an imported private key rather than CreateSelfSigned's ephemeral key.
            _certificate = X509CertificateLoader.LoadPkcs12(generated.Export(X509ContentType.Pfx), null, X509KeyStorageFlags.Exportable);
            _listener.Start();
            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            Run = Handle(tls, rejectAuth);
        }
        public ISmtpClient Client() => new SmtpClient
        {
            // Pin only this ephemeral test server certificate; production uses normal certificate validation.
            ServerCertificateValidationCallback = (_, certificate, _, _) => certificate?.GetCertHashString() == _certificate.GetCertHashString(),
        };
        private static StreamReader Reader(Stream stream) => new(stream, Encoding.UTF8, false, 4096, true);
        private static StreamWriter Writer(Stream stream) => new(stream, new UTF8Encoding(false), 4096, true) { AutoFlush = true, NewLine = "\r\n" };
        private async Task Handle(bool tls, bool rejectAuth)
        {
            using var socket = await _listener.AcceptTcpClientAsync(_stop.Token);
            var network = socket.GetStream();
            using (var reader = Reader(network))
            using (var writer = Writer(network))
            {
                await writer.WriteLineAsync("220 localhost SMTP test");
                Assert.StartsWith("EHLO ", await reader.ReadLineAsync(_stop.Token));
                await writer.WriteLineAsync(tls ? "250-localhost\r\n250 STARTTLS" : "250 localhost");
                if (!tls) return;
                Assert.Equal("STARTTLS", await reader.ReadLineAsync(_stop.Token));
                await writer.WriteLineAsync("220 Ready for TLS");
            }
            using var secure = new SslStream(network, true);
            await secure.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
            {
                ServerCertificate = _certificate,
                EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
            }, _stop.Token);
            using var input = Reader(secure);
            using var output = Writer(secure);
            Assert.StartsWith("EHLO ", await input.ReadLineAsync(_stop.Token));
            await output.WriteLineAsync("250-localhost\r\n250 AUTH PLAIN");
            var auth = (await input.ReadLineAsync(_stop.Token))!;
            Assert.StartsWith("AUTH PLAIN", auth);
            var encoded = auth.Length > 11 ? auth[11..] : "";
            if (encoded.Length == 0)
            {
                await output.WriteLineAsync("334 ");
                encoded = (await input.ReadLineAsync(_stop.Token))!;
            }
            var fields = Encoding.UTF8.GetString(Convert.FromBase64String(encoded)).Split('\0');
            Username = fields[^2]; Password = fields[^1]; AuthenticatedOverTls = secure.IsEncrypted;
            if (rejectAuth) { await output.WriteLineAsync("535 5.7.8 Authentication rejected"); return; }
            await output.WriteLineAsync("235 2.7.0 Accepted");
            Assert.StartsWith("MAIL FROM:", await input.ReadLineAsync(_stop.Token));
            await output.WriteLineAsync("250 OK");
            Assert.StartsWith("RCPT TO:", await input.ReadLineAsync(_stop.Token));
            await output.WriteLineAsync("250 OK");
            Assert.Equal("DATA", await input.ReadLineAsync(_stop.Token));
            await output.WriteLineAsync("354 Send message");
            var data = new StringBuilder();
            while (await input.ReadLineAsync(_stop.Token) is { } line && line != ".")
                data.Append(line.StartsWith("..", StringComparison.Ordinal) ? line[1..] : line).Append("\r\n");
            using var content = new MemoryStream(Encoding.UTF8.GetBytes(data.ToString()));
            Message = await MimeMessage.LoadAsync(content, _stop.Token);
            await output.WriteLineAsync("250 2.0.0 Queued");
            Assert.Equal("QUIT", await input.ReadLineAsync(_stop.Token));
            await output.WriteLineAsync("221 Bye");
        }
        public async ValueTask DisposeAsync()
        {
            await _stop.CancelAsync();
            _listener.Stop();
            try { await Run; } catch (OperationCanceledException) { }
            _certificate.Dispose(); _stop.Dispose();
        }
    }

    private static NotificationOptions Settings(int port = 587) => new()
    {
        FromEmail = "lead938@gmail.com",
        EmailProvider = "Smtp",
        Smtp = new SmtpOptions { Host = "localhost", Port = port, Username = "lead938@gmail.com", Password = "test-app-password" },
    };
    private static OutgoingEmail Email(string to = "student@example.test") => new(Guid.NewGuid(), to, "付款已確認", "<p>4 堂已加入。<br>上課見！</p>", "4 堂已加入。\n上課見！",
        new Dictionary<string, string> { ["List-Unsubscribe"] = "<https://iris.test/api/public/unsubscribe?t=x>" });

    [Fact]
    public async Task Email_uses_starttls_gmail_credentials_and_preserves_unicode_content()
    {
        await using var server = new SmtpServer();
        var sender = new SmtpEmailSender(Options.Create(Settings(server.Port)), new ClientFactory(server.Client));
        var email = Email();
        await sender.SendAsync(email, default);
        await server.Run;
        Assert.True(server.AuthenticatedOverTls);
        Assert.Equal("lead938@gmail.com", server.Username);
        Assert.Equal("test-app-password", server.Password);
        Assert.Equal("lead938@gmail.com", server.Message!.From.Mailboxes.Single().Address);
        Assert.Equal("student@example.test", server.Message.To.Mailboxes.Single().Address);
        Assert.Equal(email.Subject, server.Message.Subject);
        Assert.Equal(email.Text.Replace("\n", "\r\n"), server.Message.TextBody!.TrimEnd('\r', '\n'));
        Assert.Contains("上課見！", server.Message.HtmlBody);
        Assert.Equal("<https://iris.test/api/public/unsubscribe?t=x>", server.Message.Headers["List-Unsubscribe"]);
        Assert.Equal($"iris-email.{email.Id:N}@gmail.com", server.Message.MessageId);
    }

    [Fact]
    public async Task Missing_app_password_is_actionable_and_does_not_open_a_connection()
    {
        var settings = Settings(); settings.Smtp.Password = "";
        var clients = new ClientFactory(() => new SmtpClient());
        var sender = new SmtpEmailSender(Options.Create(settings), clients);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => sender.SendAsync(Email(), default));
        Assert.Contains("Notifications:Smtp:Password", error.Message);
        Assert.Equal(0, clients.Created);
    }

    [Fact]
    public async Task Server_without_starttls_is_rejected_before_credentials_are_sent()
    {
        await using var server = new SmtpServer(tls: false);
        var sender = new SmtpEmailSender(Options.Create(Settings(server.Port)), new ClientFactory(server.Client));
        await Assert.ThrowsAsync<NotSupportedException>(() => sender.SendAsync(Email(), default));
        await server.Run;
        Assert.Null(server.Username);
        Assert.Null(server.Message);
    }

    [Fact]
    public async Task Smtp_authentication_failure_propagates_for_outbox_retry()
    {
        await using var server = new SmtpServer(rejectAuth: true);
        var sender = new SmtpEmailSender(Options.Create(Settings(server.Port)), new ClientFactory(server.Client));
        await Assert.ThrowsAsync<MailKit.Security.AuthenticationException>(() => sender.SendAsync(Email(), default));
        await server.Run;
        Assert.Null(server.Message);
    }
}
