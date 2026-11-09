using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Tests;

public sealed class EmailFactory : StudioFactory
{
    protected override bool NotificationsEnabled => true;
}

public class EmailFlowTests(EmailFactory app) : IClassFixture<EmailFactory>, IAsyncLifetime
{
    public Task InitializeAsync() => app.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private const string Date = "2026-11-11"; // 09:30 Taipei = 49.5 h after the test clock's start

    private Task Dispatch() => new AlertDispatcher(app.Services.GetRequiredService<IServiceScopeFactory>(), NullLogger<AlertDispatcher>.Instance).DispatchAsync(default);
    private Task<List<EmailMessage>> Emails(string? template = null) => app.Db(db => db.EmailMessages.AsNoTracking()
        .Where(m => template == null || m.Template == template).OrderBy(m => m.CreatedAtUtc).ToListAsync());
    private async Task<EmailMessage> Single(string template) => Assert.Single(await Emails(template));
    private async Task<OutgoingEmail> Delivered(string template) { var m = await Single(template); return app.Email.Sent.Single(e => e.Id == m.Id); }
    private Task<string> EmailOf(Guid id) => app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.Email!).SingleAsync());
    private void Later(int seconds = 60) => app.Clock.Advance(TimeSpan.FromSeconds(seconds));

    private static async Task<HttpResponseMessage> Post(HttpClient client, string url, object? body = null, bool key = false)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body ?? new { }) };
        if (key) request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        return await client.SendAsync(request);
    }
    private static async Task<Guid> Book(HttpClient client, string time = "09:30")
    {
        var r = await Post(client, "/api/student/lessons", new { date = Date, time }, key: true);
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<JsonObject>())!["lesson"]!["id"]!.GetValue<Guid>();
    }
    private Task<Guid> PendingPayment(Guid studentId) => app.Db(async db =>
    {
        var p = new Payment { StudentId = studentId, PackageSize = 4, Amount = 3200, ReceiptPath = "x.jpg", ContentType = "image/jpeg", UploadedAtUtc = app.Clock.GetUtcNow().UtcDateTime };
        db.Payments.Add(p); await db.SaveChangesAsync(); return p.Id;
    });
    private async Task Queue(Func<AlertService, Task> work)
    {
        using var scope = app.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<AlertService>());
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().SaveChangesAsync();
    }

    [Fact]
    public async Task Registration_emails_the_student_and_iris_and_the_verification_link_works_once()
    {
        var (id, student) = await app.Student(active: false);
        var email = await EmailOf(id);
        Assert.Equal(["registration-pending", "teacher-new-registration", "verify-email"], (await Emails()).Select(m => m.Template).Order());
        await Dispatch();
        Assert.Equal(3, app.Email.Sent.Count);
        Assert.All(await Emails(), m => Assert.Equal(EmailStatus.Sent, m.Status));
        Assert.Equal("teacher@test.local", (await Delivered("teacher-new-registration")).To);

        var verify = await Delivered("verify-email");
        Assert.Equal(email, verify.To);
        Assert.Contains("<html", verify.Html); Assert.Contains("驗證 Email", verify.Text);
        var token = Regex.Match(verify.Text, @"verify-email\?token=([A-Za-z0-9_-]+)").Groups[1].Value;
        Assert.Equal("{}", (await Single("verify-email")).Data); // the link is gone from the database once sent
        Assert.False(await app.Db(db => db.AuthTokens.AnyAsync(t => t.TokenHash == token)));

        (await Post(app.Anonymous(), "/api/auth/verify-email", new { token })).EnsureSuccessStatusCode();
        Assert.True((await student.GetFromJsonAsync<JsonObject>("/api/me"))!["emailVerified"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(app.Anonymous(), "/api/auth/verify-email", new { token })).StatusCode);
    }

    [Fact]
    public async Task Password_reset_does_not_reveal_accounts_works_once_and_signs_out_every_old_session()
    {
        var (id, student) = await app.Student();
        var email = await EmailOf(id);
        Assert.Equal(HttpStatusCode.Accepted, (await Post(app.Anonymous(), "/api/auth/forgot-password", new { email = "nobody@test.local" })).StatusCode);
        Assert.Empty(await Emails("password-reset"));
        Assert.Equal(HttpStatusCode.Accepted, (await Post(app.Anonymous(), "/api/auth/forgot-password", new { email })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await Post(app.Anonymous(), "/api/auth/forgot-password", new { email })).StatusCode);
        await Dispatch();
        var reset = await Delivered("password-reset"); // the second request inside the cool-down sent nothing
        var token = Regex.Match(reset.Text, @"reset-password\?token=([A-Za-z0-9_-]+)").Groups[1].Value;

        Assert.Equal(HttpStatusCode.BadRequest, (await Post(app.Anonymous(), "/api/auth/reset-password", new { token, password = "short" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(app.Anonymous(), "/api/auth/reset-password", new { token, password = "New-password-123" })).StatusCode);
        Assert.Equal("null", await (await student.GetAsync("/api/me")).Content.ReadAsStringAsync()); // old session rejected
        using var again = await app.Login(email, "New-password-123");
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(app.Anonymous(), "/api/auth/reset-password", new { token, password = "Another-pass-456" })).StatusCode);
    }

    [Fact]
    public async Task Booking_confirmation_waits_out_the_undo_window_and_a_cancelled_lesson_gets_only_the_cancellation()
    {
        var (_, student) = await app.Student();
        await Dispatch(); app.Email.Sent.Clear();
        var lesson = await Book(student);
        var confirm = await Single("booking-confirmed");
        Assert.True(confirm.SendAfterUtc > app.Clock.GetUtcNow().UtcDateTime.AddSeconds(30));
        await Dispatch();
        Assert.Empty(app.Email.Sent);

        (await Post(student, $"/api/student/lessons/{lesson}/cancel")).EnsureSuccessStatusCode();
        Later(); await Dispatch();
        Assert.Equal((EmailStatus.Skipped, "lesson_changed"), ((await Single("booking-confirmed")).Status, (await Single("booking-confirmed")).Outcome));
        var cancelled = await Delivered("booking-cancelled");
        Assert.Contains("已退回 1 堂", cancelled.Text);
        Assert.Contains("2026年11月11日（三）", cancelled.Subject);
    }

    [Fact]
    public async Task Undoing_a_cancellation_drops_its_email()
    {
        var (_, student) = await app.Student();
        var lesson = await Book(student);
        (await Post(student, $"/api/student/lessons/{lesson}/cancel")).EnsureSuccessStatusCode();
        Assert.Single(await Emails("booking-cancelled"));
        (await Post(student, $"/api/student/lessons/{lesson}/undo-cancel")).EnsureSuccessStatusCode();
        Assert.Empty(await Emails("booking-cancelled"));
        Later(); await Dispatch();
        Assert.Equal(EmailStatus.Sent, (await Single("booking-confirmed")).Status);
    }

    [Fact]
    public async Task Class_reminder_is_queued_once_inside_24_hours_and_never_sent_for_a_cancelled_class()
    {
        var (_, student) = await app.Student();
        var lesson = await Book(student);
        async Task RunReminders()
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await ClassReminders.QueueAsync(db, scope.ServiceProvider.GetRequiredService<StudioClock>(), scope.ServiceProvider.GetRequiredService<AlertService>(),
                scope.ServiceProvider.GetRequiredService<IOptions<StudioOptions>>().Value, default);
            await db.SaveChangesAsync();
        }
        await RunReminders();
        Assert.Empty(await Emails("class-reminder")); // 49.5 h ahead: too early
        app.Clock.Advance(TimeSpan.FromHours(26));
        await RunReminders(); await RunReminders();
        Assert.Single(await Emails("class-reminder"));

        using var teacher = await app.Login();
        (await Post(teacher, $"/api/teacher/lessons/{lesson}/cancel")).EnsureSuccessStatusCode();
        await Dispatch();
        Assert.Equal("lesson_changed", (await Single("class-reminder")).Outcome);
        Assert.DoesNotContain(app.Email.Sent, e => e.Subject.StartsWith("上課提醒"));
    }

    [Fact]
    public async Task Payment_reminder_is_not_sent_after_the_student_has_paid()
    {
        var (id, _) = await app.Student(credits: 0);
        using var teacher = await app.Login();
        (await Post(teacher, $"/api/teacher/students/{id}/remind", new { message = "請記得續購喔！" })).EnsureSuccessStatusCode();
        await PendingPayment(id);
        Later(); await Dispatch();
        Assert.Equal((EmailStatus.Skipped, "already_paid"), ((await Single("payment-reminder")).Status, (await Single("payment-reminder")).Outcome));
    }

    [Fact]
    public async Task Preferences_turn_off_optional_emails_but_never_payment_confirmations()
    {
        var (id, student) = await app.Student();
        using var put = new HttpRequestMessage(HttpMethod.Put, "/api/me/notifications") { Content = JsonContent.Create(new { emailUpdates = false, emailReminders = true }) };
        (await student.SendAsync(put)).EnsureSuccessStatusCode();
        await Book(student);
        var payment = await PendingPayment(id);
        using var teacher = await app.Login();
        (await Post(teacher, $"/api/teacher/payments/{payment}/confirm", key: true)).EnsureSuccessStatusCode();
        Later(); await Dispatch();
        Assert.Equal("preference", (await Single("booking-confirmed")).Outcome);
        Assert.Contains("新增堂數：4 堂", (await Delivered("payment-confirmed")).Text);
    }

    [Fact]
    public async Task Undone_payment_decision_never_emails()
    {
        var (id, _) = await app.Student();
        var payment = await PendingPayment(id);
        using var teacher = await app.Login();
        (await Post(teacher, $"/api/teacher/payments/{payment}/confirm", key: true)).EnsureSuccessStatusCode();
        (await Post(teacher, $"/api/teacher/payments/{payment}/undo")).EnsureSuccessStatusCode();
        Later(); await Dispatch();
        Assert.Empty(await Emails("payment-confirmed"));
    }

    [Fact]
    public async Task Marketing_needs_consent_carries_one_click_unsubscribe_and_the_link_withdraws_consent()
    {
        var (id, _) = await app.Student();
        Dictionary<string, string> News() => new() { ["headline"] = "冬季工作坊", ["preheader"] = "名額有限", ["body"] = "歡迎報名。", ["actionPath"] = "/" };
        await Queue(a => a.EmailAsync(id, "studio-news", News(), "news:1", delay: false));
        await Queue(a => a.EmailAsync(id, "studio-news", News(), "news:1", delay: false)); // same event: one row
        await Dispatch();
        Assert.Equal("no_consent", (await Single("studio-news")).Outcome);

        await app.Db(db => { db.ConsentRecords.Add(new ConsentRecord { UserId = id, Kind = ConsentKind.Marketing, Granted = true, Version = "v", Source = ConsentSource.Profile }); return db.SaveChangesAsync(); });
        await Queue(a => a.EmailAsync(id, "studio-news", News(), "news:2", delay: false));
        await Dispatch();
        var sent = app.Email.Sent.Single(e => e.Subject == "冬季工作坊");
        Assert.Equal("List-Unsubscribe=One-Click", sent.Headers["List-Unsubscribe-Post"]);
        var oneClick = new Uri(sent.Headers["List-Unsubscribe"].Trim('<', '>'));
        Assert.Contains("取消訂閱", sent.Html);

        Assert.Equal(HttpStatusCode.BadRequest, (await app.Anonymous().PostAsync("/api/public/unsubscribe?t=tampered", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await app.Anonymous().PostAsync(oneClick.PathAndQuery, new FormUrlEncodedContent([new("List-Unsubscribe", "One-Click")]))).StatusCode);
        var latest = await app.Db(db => db.ConsentRecords.Where(c => c.UserId == id && c.Kind == ConsentKind.Marketing).OrderByDescending(c => c.CreatedAtUtc).FirstAsync());
        Assert.False(latest.Granted);
        Assert.Equal(ConsentSource.Request, latest.Source);
    }

    [Fact]
    public async Task Failed_deliveries_retry_with_backoff_then_stop_and_record_only_the_error_type()
    {
        await app.Student();
        app.Email.Fail = true;
        await Dispatch();
        var first = await Single("verify-email");
        Assert.Equal((EmailStatus.Queued, 1, "HttpRequestException"), (first.Status, first.Attempts, first.Outcome));
        Assert.True(first.NextAttemptUtc > app.Clock.GetUtcNow().UtcDateTime);
        for (var i = 1; i < EmailDelivery.MaxAttempts; i++) { app.Clock.Advance(TimeSpan.FromHours(2)); await Dispatch(); }
        var last = await Single("verify-email");
        Assert.Equal((EmailStatus.Failed, EmailDelivery.MaxAttempts), (last.Status, last.Attempts));
        Assert.Equal("{}", last.Data);
        Assert.DoesNotContain("@", last.Outcome);
    }

    [Fact]
    public async Task Consult_emails_the_applicant_and_iris_and_sends_a_Meet_confirmation_when_scheduled_or_moved()
    {
        using var guest = app.Anonymous();
        (await Post(guest, "/api/public/consults", new { name = "陳先生", contactType = "email", contact = "guest@test.local", preferredTime = "weekend", topic = "想學發聲" })).EnsureSuccessStatusCode();
        (await Post(guest, "/api/public/consults", new { name = "林小姐", contactType = "line", contact = "lin123", preferredTime = "any", topic = "" })).EnsureSuccessStatusCode();
        Assert.Equal("guest@test.local", (await Single("consult-received")).To); // the LINE applicant has no email
        Assert.Equal(2, (await Emails("teacher-new-consult")).Count);

        using var teacher = await app.Login();
        var id = await app.Db(db => db.Consults.Where(c => c.ContactType == "email").Select(c => c.Id).SingleAsync());
        for (var i = 0; i < 2; i++)
            (await Post(teacher, $"/api/teacher/consults/{id}/schedule", new { date = "2026-11-15", time = "14:00", note = "線上視訊：https://meet.google.com/uhd-nzdk-qan" })).EnsureSuccessStatusCode();
        await Dispatch();
        var confirmation = await Delivered("consult-scheduled");
        Assert.Equal("guest@test.local", confirmation.To);
        Assert.Contains("諮詢時間確認｜2026年11月15日（日） 14:00", confirmation.Subject);
        Assert.Contains("14:00（台北時間，UTC+8）", confirmation.Text);
        Assert.Contains("備註：線上視訊：https://meet.google.com/uhd-nzdk-qan", confirmation.Text);
        Assert.Contains("加入 Google Meet：https://meet.google.com/uhd-nzdk-qan", confirmation.Text);
        Assert.Contains("href=\"https://meet.google.com/uhd-nzdk-qan\"", confirmation.Html);
        var moved = await Post(teacher, $"/api/teacher/consults/{id}/schedule", new { date = "2026-11-16", time = "10:00" });
        var dto = (await moved.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.Equal(("2026-11-16", "10:00", true), (dto["scheduledDate"]!.GetValue<string>(), dto["scheduledTime"]!.GetValue<string>(), dto["contacted"]!.GetValue<bool>()));
        Assert.Equal(2, (await Emails("consult-scheduled")).Count);
        await Dispatch();
        Assert.Contains(app.Email.Sent, e => e.To == "guest@test.local" && e.Subject == "諮詢時間確認｜2026年11月16日（一） 10:00");
    }

    private Task<Guid> Consult(string contactType = "email") => app.Db(async db =>
    {
        var c = new Consult { Name = "諮詢測試", ContactType = contactType, Contact = contactType == "email" ? "guest@test.local" : "line-id", PreferredTime = "any" };
        db.Consults.Add(c); await db.SaveChangesAsync(); return c.Id;
    });

    [Fact]
    public async Task Changing_only_the_Meet_note_or_returning_to_an_old_schedule_sends_the_latest_confirmation_once()
    {
        var id = await Consult();
        using var teacher = await app.Login();
        var url = $"/api/teacher/consults/{id}/schedule";
        var original = new { date = "2026-11-15", time = "14:00", note = "https://meet.google.com/uhd-nzdk-qan" };
        (await Post(teacher, url, original)).EnsureSuccessStatusCode();
        app.Email.Fail = true;
        await Dispatch(); // a failed old confirmation must also stop retrying after a change
        Assert.Equal(1, (await Single("consult-scheduled")).Attempts);
        app.Email.Fail = false;
        (await Post(teacher, url, new { original.date, original.time, note = "改用 https://meet.google.com/abc-defg-hij" })).EnsureSuccessStatusCode();
        (await Post(teacher, url, original)).EnsureSuccessStatusCode();
        (await Post(teacher, url, original)).EnsureSuccessStatusCode(); // unchanged retry
        var queued = await Emails("consult-scheduled");
        Assert.Equal(3, queued.Count);
        Assert.Equal(2, queued.Count(m => m.Status == EmailStatus.Skipped && m.Outcome == "consult_changed"));
        Assert.Single(queued, m => m.Status == EmailStatus.Queued);
        Later(); await Dispatch();
        var sent = Assert.Single(app.Email.Sent);
        Assert.Contains("加入 Google Meet：https://meet.google.com/uhd-nzdk-qan", sent.Text);
        Assert.DoesNotContain("abc-defg-hij", sent.Text);
    }

    [Fact]
    public async Task Iris_can_resend_an_existing_confirmation_with_a_cooldown_and_cannot_email_LINE_only_consults()
    {
        var id = await Consult();
        var lineId = await Consult("line");
        using var teacher = await app.Login();
        using var guest = app.Anonymous();
        var url = $"/api/teacher/consults/{id}/confirmation";
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(guest, url)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(teacher, url)).StatusCode); // not scheduled yet
        var slot = new { date = "2026-11-15", time = "14:00", note = "https://meet.google.com/uhd-nzdk-qan" };
        foreach (var cid in new[] { id, lineId })
            (await Post(teacher, $"/api/teacher/consults/{cid}/schedule", slot)).EnsureSuccessStatusCode();
        Assert.Single(await Emails("consult-scheduled")); // LINE contact is never used as an email address
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(teacher, $"/api/teacher/consults/{lineId}/confirmation")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(teacher, url)).StatusCode);
        await Dispatch();
        Later(61);
        Assert.Equal(HttpStatusCode.Accepted, (await Post(teacher, url)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(teacher, url)).StatusCode);
        await Dispatch();
        Assert.Equal(2, app.Email.Sent.Count);
        Assert.All(app.Email.Sent, m => Assert.Contains("加入 Google Meet：https://meet.google.com/uhd-nzdk-qan", m.Text));
        app.Clock.Advance(TimeSpan.FromDays(10));
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(teacher, url)).StatusCode);
    }

    [Theory]
    [InlineData("note")]
    [InlineData("slot")]
    [InlineData("address")]
    [InlineData("deleted")]
    [InlineData("past")]
    public async Task Queued_consult_confirmation_is_skipped_if_its_current_state_no_longer_matches(string change)
    {
        var id = await Consult();
        using var teacher = await app.Login();
        (await Post(teacher, $"/api/teacher/consults/{id}/schedule", new { date = "2026-11-15", time = "14:00", note = "https://meet.google.com/uhd-nzdk-qan" })).EnsureSuccessStatusCode();
        await app.Db(async db =>
        {
            var c = await db.Consults.SingleAsync(c => c.Id == id);
            if (change == "note") c.ScheduleNote = "新連結 https://meet.google.com/abc-defg-hij";
            if (change == "slot") c.ScheduledTime = new TimeOnly(15, 0);
            if (change == "address") c.Contact = "other@test.local";
            if (change == "deleted") db.Consults.Remove(c);
            return await db.SaveChangesAsync();
        });
        if (change == "past") app.Clock.Advance(TimeSpan.FromDays(10));
        await Dispatch();
        Assert.Empty(app.Email.Sent);
        var m = await Single("consult-scheduled");
        Assert.Equal((EmailStatus.Skipped, "consult_changed"), (m.Status, m.Outcome));
    }
}
