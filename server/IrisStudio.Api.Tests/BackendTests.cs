using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;

namespace IrisStudio.Api.Tests;

public class BackendTests(StudioFactory app) : IClassFixture<StudioFactory>, IAsyncLifetime
{
    public Task InitializeAsync() => app.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;
    private const string Date = "2026-11-11";
    private static async Task<JsonObject> Json(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonObject>())!;
    }
    private static async Task<HttpResponseMessage> Post(HttpClient client, string url, object body, Guid? key = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        if (key is not null) request.Headers.Add("Idempotency-Key", key.ToString());
        return await client.SendAsync(request);
    }
    private static async Task<Guid> Book(HttpClient client, string time = "09:30", string date = Date) =>
        (await Json(await Post(client, "/api/student/lessons", new { date, time }, Guid.NewGuid())))["lesson"]!["id"]!.GetValue<Guid>();
    private Task<int> Credits(Guid id) => app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.Credits).SingleAsync());

    [Fact]
    public async Task Anonymous_me_is_json_null_for_the_client_session_query()
    {
        using var client = app.Anonymous();
        var response = await client.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("null", await response.Content.ReadAsStringAsync());
        Assert.Equal("application/json", response.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Pending_account_cannot_access_slots_or_student_routes_and_approval_works_without_login()
    {
        var (id, student) = await app.Student(active: false);
        using var teacher = await app.Login();
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/slots?date={Date}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/student/payments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/students")).StatusCode);
        (await teacher.PostAsync($"/api/teacher/applications/{id}/approve", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/slots?date={Date}")).StatusCode);
        (await teacher.PostAsync($"/api/teacher/applications/{id}/undo", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/slots?date={Date}")).StatusCode);
        Assert.Equal(0, await app.Db(db => db.Alerts.CountAsync()));
    }

    [Fact]
    public async Task Persisted_timestamps_keep_utc_including_nullable_values_and_api_projections()
    {
        var (id, student) = await app.Student(active: false);
        using (student)
        using (var teacher = await app.Login())
        {
            var created = await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.CreatedAtUtc).SingleAsync());
            Assert.Equal(DateTimeKind.Utc, created.Kind);
            var requests = (await teacher.GetFromJsonAsync<JsonObject>("/api/teacher/requests"))!;
            var application = requests["applications"]!.AsArray().Single(a => a!["id"]!.GetValue<Guid>() == id)!;
            Assert.EndsWith("Z", application["createdAt"]!.GetValue<string>());
            (await teacher.PostAsync($"/api/teacher/applications/{id}/approve", null)).EnsureSuccessStatusCode();
            var decided = await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.DecidedAtUtc).SingleAsync());
            Assert.NotNull(decided);
            Assert.Equal(DateTimeKind.Utc, decided.Value.Kind);
        }
    }

    [Fact]
    public async Task Login_has_persistent_secure_cookie_and_same_error_for_unknown_email()
    {
        using var client = app.Anonymous();
        var valid = await client.PostAsJsonAsync("/api/auth/login", new { email = "teacher@test.local", password = "test-teacher-Password12!" });
        var cookie = valid.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("iris.auth="));
        Assert.Contains("expires=", cookie); Assert.Contains("httponly", cookie); Assert.Contains("secure", cookie); Assert.Contains("samesite=lax", cookie);
        var unknown = await client.PostAsJsonAsync("/api/auth/login", new { email = "missing@test.local", password = "incorrect" });
        var wrong = await client.PostAsJsonAsync("/api/auth/login", new { email = "teacher@test.local", password = "incorrect" });
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        var unknownBody = (await unknown.Content.ReadFromJsonAsync<JsonObject>())!;
        var wrongBody = (await wrong.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.Equal(unknownBody["detail"]!.GetValue<string>(), wrongBody["detail"]!.GetValue<string>());
        Assert.Equal(unknownBody["code"]!.GetValue<string>(), wrongBody["code"]!.GetValue<string>());
    }

    [Fact]
    public async Task Booking_retries_replay_same_response_and_changed_payload_is_rejected()
    {
        var (id, student) = await app.Student();
        var key = Guid.NewGuid();
        var first = await Post(student, "/api/student/lessons", new { date = Date, time = "09:30" }, key);
        var replay = await Post(student, "/api/student/lessons", new { date = Date, time = "09:30" }, key);
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode);
        Assert.Equal(first.Headers.Location, replay.Headers.Location);
        Assert.True(JsonNode.DeepEquals(await first.Content.ReadFromJsonAsync<JsonNode>(), await replay.Content.ReadFromJsonAsync<JsonNode>()));
        Assert.Equal("true", replay.Headers.GetValues("Idempotent-Replayed").Single());
        Assert.Equal(3, await Credits(id));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post(student, "/api/student/lessons", new { date = Date, time = "11:00" }, key)).StatusCode);
    }

    [Fact]
    public async Task Simultaneous_bookings_have_one_winner_and_last_credit_cannot_be_spent_twice()
    {
        var (oneId, one) = await app.Student(1);
        var (twoId, two) = await app.Student(1);
        var race = await Task.WhenAll(Post(one, "/api/student/lessons", new { date = Date, time = "09:30" }), Post(two, "/api/student/lessons", new { date = Date, time = "09:30" }));
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await Credits(oneId) + await Credits(twoId));
        var remaining = await Credits(oneId) == 1 ? one : two;
        var last = await Task.WhenAll(Post(remaining, "/api/student/lessons", new { date = Date, time = "14:00" }), Post(remaining, "/api/student/lessons", new { date = Date, time = "15:30" }));
        Assert.Single(last, r => r.IsSuccessStatusCode);
        Assert.Equal(0, await Credits(oneId) + await Credits(twoId));
    }

    [Fact]
    public async Task Failed_booking_does_not_keep_an_idempotency_key_or_deduct_credits()
    {
        var (id, student) = await app.Student(1);
        var key = Guid.NewGuid();
        var failed = await Post(student, "/api/student/lessons", new { date = Date, time = "10:00" }, key);
        Assert.Equal(HttpStatusCode.BadRequest, failed.StatusCode);
        Assert.Equal(1, await Credits(id));
        Assert.False(await app.Db(db => db.IdempotencyRecords.AnyAsync(r => r.Key == key)));
        (await Post(student, "/api/student/lessons", new { date = Date, time = "09:30" }, key)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Teacher_booking_cannot_spend_a_pending_students_credits_or_a_teachers_credits()
    {
        var (id, _) = await app.Student(4, active: false);
        using var teacher = await app.Login();
        Assert.Equal(HttpStatusCode.Conflict, (await Post(teacher, $"/api/teacher/lessons?studentId={id}", new { date = Date, time = "09:30" })).StatusCode);
        Assert.Equal(4, await Credits(id));
    }

    [Fact]
    public async Task Cancellation_refunds_once_drops_auto_reminder_and_undo_has_actor_and_time_checks()
    {
        var (id, student) = await app.Student(1);
        using var teacher = await app.Login();
        var lesson = await Book(student);
        Assert.Single(await app.Db(db => db.Alerts.ToListAsync()));
        var cancelled = await Task.WhenAll(student.PostAsync($"/api/student/lessons/{lesson}/cancel", null), student.PostAsync($"/api/student/lessons/{lesson}/cancel", null));
        Assert.Single(cancelled, r => r.IsSuccessStatusCode);
        Assert.Equal(1, await Credits(id)); Assert.Equal(0, await app.Db(db => db.Alerts.CountAsync()));
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.PostAsync($"/api/teacher/lessons/{lesson}/undo-cancel", null)).StatusCode);
        (await student.PostAsync($"/api/student/lessons/{lesson}/undo-cancel", null)).EnsureSuccessStatusCode();
        Assert.Equal(0, await Credits(id));
        (await student.PostAsync($"/api/student/lessons/{lesson}/cancel", null)).EnsureSuccessStatusCode();
        app.Clock.Advance(TimeSpan.FromSeconds(31));
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/student/lessons/{lesson}/undo-cancel", null)).StatusCode);
        Assert.Equal(1, await Credits(id));
        Assert.Equal(0, await app.Db(db => db.CreditLogs.SumAsync(l => l.Delta)));
    }

    [Theory]
    [InlineData(24, true)]
    [InlineData(23.999, false)]
    public async Task Student_refund_boundary_is_24_hours(double hours, bool refunded)
    {
        var (id, student) = await app.Student(1);
        var lesson = await Book(student, "09:30", "2026-11-10");
        var until = DateTimeOffset.Parse("2026-11-10T01:30:00Z") - app.Clock.GetUtcNow() - TimeSpan.FromHours(hours);
        app.Clock.Advance(until);
        var result = await Json(await student.PostAsync($"/api/student/lessons/{lesson}/cancel", null));
        Assert.Equal(refunded, result["refunded"]!.GetValue<bool>());
        Assert.Equal(refunded ? 1 : 0, await Credits(id));
    }

    [Fact]
    public async Task Teacher_proposal_replaces_student_request_and_moves_only_with_consent()
    {
        var (id, student) = await app.Student();
        using var teacher = await app.Login();
        var lesson = await Book(student);
        (await Post(student, $"/api/student/lessons/{lesson}/change-requests", new { date = Date, time = "11:00", reason = "有事" })).EnsureSuccessStatusCode();
        var proposal = await Json(await Post(teacher, $"/api/teacher/lessons/{lesson}/proposals", new { date = Date, time = "14:00", message = "可以嗎？" }));
        Assert.Equal(new TimeOnly(9, 30), await app.Db(db => db.Lessons.Where(l => l.Id == lesson).Select(l => l.Time).SingleAsync()));
        Assert.Equal(1, await app.Db(db => db.ChangeRequests.CountAsync(c => c.Status == ChangeStatus.Open)));
        var (_, other) = await app.Student();
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/student/change-requests/{proposal["id"]}/accept", null)).StatusCode);
        (await student.PostAsync($"/api/student/change-requests/{proposal["id"]}/accept", null)).EnsureSuccessStatusCode();
        Assert.Equal(new TimeOnly(14, 0), await app.Db(db => db.Lessons.Where(l => l.Id == lesson).Select(l => l.Time).SingleAsync()));
        Assert.Equal(3, await Credits(id));
    }

    [Fact]
    public async Task A_cancelled_lesson_cannot_be_resurrected_by_an_old_proposal_or_teacher_undo()
    {
        var (_, student) = await app.Student();
        using var teacher = await app.Login();
        var lesson = await Book(student);
        var proposal = await Json(await Post(teacher, $"/api/teacher/lessons/{lesson}/proposals", new { date = Date, time = "14:00" }));
        (await student.PostAsync($"/api/student/lessons/{lesson}/cancel", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/student/change-requests/{proposal["id"]}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await teacher.PostAsync($"/api/teacher/change-requests/{proposal["id"]}/undo", null)).StatusCode);
        Assert.Equal(LessonStatus.Cancelled, await app.Db(db => db.Lessons.Select(l => l.Status).SingleAsync()));
    }

    [Fact]
    public async Task Move_cutoff_and_revalidation_of_teacher_availability_are_enforced()
    {
        var (_, student) = await app.Student();
        using var teacher = await app.Login();
        var lesson = await Book(student);
        var request = await Json(await Post(student, $"/api/student/lessons/{lesson}/change-requests", new { date = "2026-11-12", time = "09:30", reason = "工作" }));
        (await teacher.PutAsJsonAsync("/api/teacher/availability/overrides/2026-11-12", new { closed = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await teacher.PostAsync($"/api/teacher/change-requests/{request["id"]}/approve", null)).StatusCode);
        app.Clock.Advance(TimeSpan.FromHours(38)); // 11.5 hours before the Wednesday lesson
        (await student.PostAsync($"/api/student/change-requests/{request["id"]}/withdraw", null)).EnsureSuccessStatusCode();
        var late = await Post(student, $"/api/student/lessons/{lesson}/change-requests", new { date = "2026-11-13", time = "09:30" });
        Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);
        Assert.Contains("too_late_to_move", await late.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Credit_adjustment_requires_reason_and_undo_uses_audit_record_once()
    {
        var (id, _) = await app.Student(2);
        using var teacher = await app.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(teacher, $"/api/teacher/students/{id}/credits", new { delta = 1 })).StatusCode);
        var adjusted = await Json(await Post(teacher, $"/api/teacher/students/{id}/credits", new { delta = 2, reason = "補課" }, Guid.NewGuid()));
        Assert.Equal(4, await Credits(id));
        (await teacher.PostAsync($"/api/teacher/credit-adjustments/{adjusted["id"]}/undo", null)).EnsureSuccessStatusCode();
        Assert.Equal(2, await Credits(id));
        Assert.Equal(HttpStatusCode.Conflict, (await teacher.PostAsync($"/api/teacher/credit-adjustments/{adjusted["id"]}/undo", null)).StatusCode);
        Assert.Equal(0, await app.Db(db => db.Alerts.CountAsync()));
        Assert.Equal(0, await app.Db(db => db.CreditLogs.SumAsync(l => l.Delta)));
    }

    private static byte[] Image(SKEncodedImageFormat format = SKEncodedImageFormat.Png, uint color = 0xffabcdef)
    {
        using var bitmap = new SKBitmap(2, 2); bitmap.Erase(new SKColor(color));
        using var data = bitmap.Encode(format, 90); return data.ToArray();
    }
    private static async Task<HttpResponseMessage> Upload(HttpClient client, byte[] image, int size = 4, Guid? key = null)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(size.ToString()), "packageSize");
        form.Add(new ByteArrayContent(image), "receipt", "receipt.png");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/student/payments") { Content = form };
        if (key is not null) request.Headers.Add("Idempotency-Key", key.ToString());
        return await client.SendAsync(request);
    }

    [Fact]
    public async Task Receipt_idempotency_hashes_image_bytes_and_receipts_are_private()
    {
        var (_, student) = await app.Student(); var (_, other) = await app.Student();
        using var teacher = await app.Login(); using var anonymous = app.Anonymous();
        var key = Guid.NewGuid(); var bytes = Image();
        var payment = await Json(await Upload(student, bytes, key: key));
        var replay = await Upload(student, bytes, key: key);
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Upload(student, Image(color: 0xff112233), key: key)).StatusCode);
        var url = payment["receiptUrl"]!.GetValue<string>();
        Assert.Equal(bytes, await student.GetByteArrayAsync(url));
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
        Assert.StartsWith("data:image/jpeg;base64,", payment["lqip"]!.GetValue<string>());
    }

    [Fact]
    public async Task Invalid_receipts_and_multiple_pending_uploads_are_rejected()
    {
        var (_, student) = await app.Student();
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(student, [1, 2, 3])).StatusCode);
        var race = await Task.WhenAll(Upload(student, Image()), Upload(student, Image()));
        Assert.Single(race, r => r.IsSuccessStatusCode);
        Assert.Single(race, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await app.Db(db => db.Payments.CountAsync()));
    }

    [Fact]
    public async Task Payment_confirmation_adds_on_top_once_under_concurrency_and_undo_is_audited()
    {
        var (id, student) = await app.Student(3);
        using var teacher = await app.Login();
        var p = await Json(await Upload(student, Image()));
        var url = $"/api/teacher/payments/{p["id"]}";
        var decisions = await Task.WhenAll(Post(teacher, url + "/confirm", new { }, Guid.NewGuid()), Post(teacher, url + "/confirm", new { }, Guid.NewGuid()));
        Assert.Single(decisions, r => r.IsSuccessStatusCode); Assert.Equal(7, await Credits(id));
        (await teacher.PostAsync(url + "/undo", null)).EnsureSuccessStatusCode(); Assert.Equal(3, await Credits(id));
        Assert.Equal(0, await app.Db(db => db.CreditLogs.SumAsync(l => l.Delta)));
        Assert.Equal(0, await app.Db(db => db.Alerts.CountAsync()));
    }

    [Theory]
    [InlineData(LessonType.Private)]
    [InlineData(LessonType.Group)]
    [InlineData(LessonType.Trial)]
    public async Task Single_lesson_requires_teacher_confirmed_consultation_regardless_of_class_type(LessonType type)
    {
        var (id, student) = await app.Student(0, type);
        using var teacher = await app.Login();
        var route = $"/api/teacher/students/{id}/consultation";
        Assert.False((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        var blocked = await Upload(student, Image(), size: 1);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal("trial_not_available", (await blocked.Content.ReadFromJsonAsync<JsonObject>())!["code"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PatchAsJsonAsync(route, new { consultationCompleted = true })).StatusCode);
        using var anonymous = app.Anonymous();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PatchAsJsonAsync(route, new { consultationCompleted = true })).StatusCode);

        (await teacher.PatchAsJsonAsync(route, new { consultationCompleted = true })).EnsureSuccessStatusCode();
        Assert.True((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        Assert.True((await Json(await teacher.GetAsync($"/api/teacher/students/{id}")))["consultationCompleted"]!.GetValue<bool>());
        (await teacher.PatchAsJsonAsync(route, new { consultationCompleted = false })).EnsureSuccessStatusCode();
        Assert.False((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(student, Image(), size: 1)).StatusCode);
        // Regular packages remain available both before and after the consultation.
        var regular = await Json(await Upload(student, Image(), size: 4));
        (await Post(teacher, $"/api/teacher/payments/{regular["id"]}/reject", new { reason = "更換方案" })).EnsureSuccessStatusCode();
        (await teacher.PatchAsJsonAsync(route, new { consultationCompleted = true })).EnsureSuccessStatusCode();
        regular = await Json(await Upload(student, Image(), size: 4));
        (await Post(teacher, $"/api/teacher/payments/{regular["id"]}/reject", new { reason = "更換方案" })).EnsureSuccessStatusCode();

        var first = await Json(await Upload(student, Image(), size: 1));
        Assert.Equal(1500, first["amount"]!.GetValue<int>());
        Assert.True(first["trial"]!.GetValue<bool>());
        Assert.False((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        (await Post(teacher, $"/api/teacher/payments/{first["id"]}/reject", new { reason = "請重新上傳" })).EnsureSuccessStatusCode();
        Assert.True((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        var second = await Json(await Upload(student, Image(), size: 1));
        (await Post(teacher, $"/api/teacher/payments/{second["id"]}/confirm", new { })).EnsureSuccessStatusCode();
        Assert.Equal(1, await Credits(id));
        Assert.False((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(student, Image(), size: 1)).StatusCode);
        (await Upload(student, Image(), size: 4)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Consultation_form_and_account_approval_do_not_unlock_single_lesson()
    {
        var (id, student) = await app.Student(0, LessonType.Trial, active: false);
        using var teacher = await app.Login();
        var email = await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.Email).SingleAsync());
        (await Post(student, "/api/public/consults", new { name = "學生", contactType = "email", contact = email, preferredTime = "any", topic = "" })).EnsureSuccessStatusCode();
        (await teacher.PostAsync($"/api/teacher/applications/{id}/approve", null)).EnsureSuccessStatusCode();
        Assert.False((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(student, Image(), size: 1)).StatusCode);
    }

    [Fact]
    public async Task Pending_student_cannot_buy_even_after_consultation_is_confirmed()
    {
        var (id, student) = await app.Student(0, LessonType.Trial, active: false);
        using var teacher = await app.Login();
        (await teacher.PatchAsJsonAsync($"/api/teacher/students/{id}/consultation", new { consultationCompleted = true })).EnsureSuccessStatusCode();
        Assert.False((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(student, Image(), size: 1)).StatusCode);
        (await teacher.PostAsync($"/api/teacher/applications/{id}/approve", null)).EnsureSuccessStatusCode();
        Assert.True((await Json(await student.GetAsync("/api/me")))["trialAvailable"]!.GetValue<bool>());
        (await Upload(student, Image(), size: 1)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Automatic_reminders_respect_pending_receipts_and_24_hour_deduplication()
    {
        var (id, student) = await app.Student(1);
        (await Upload(student, Image())).EnsureSuccessStatusCode();
        await Book(student);
        Assert.Equal(0, await app.Db(db => db.Alerts.CountAsync(a => a.Kind == AlertKind.Reminder)));
        var (_, other) = await app.Student(1);
        using var teacher = await app.Login();
        var me = await Json(await other.GetAsync("/api/me"));
        (await Post(teacher, $"/api/teacher/students/{me["id"]}/remind", new { message = "請繳費" })).EnsureSuccessStatusCode();
        await Book(other, "11:00");
        Assert.Equal(1, await app.Db(db => db.Alerts.CountAsync(a => a.Kind == AlertKind.Reminder)));
    }

    [Fact]
    public async Task Attendance_settlement_closes_open_requests_and_never_changes_cancelled_lessons()
    {
        var (_, student) = await app.Student();
        var lesson = await Book(student);
        (await Post(student, $"/api/student/lessons/{lesson}/change-requests", new { date = Date, time = "14:00" })).EnsureSuccessStatusCode();
        app.Clock.Advance(TimeSpan.FromDays(3));
        using var scope = app.Services.CreateScope();
        var count = await AttendanceSettler.RunAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope.ServiceProvider.GetRequiredService<StudioClock>(), default);
        Assert.Equal(1, count);
        Assert.Equal(LessonStatus.Attended, await app.Db(db => db.Lessons.Select(l => l.Status).SingleAsync()));
        Assert.Equal(ChangeStatus.Declined, await app.Db(db => db.ChangeRequests.Select(c => c.Status).SingleAsync()));
        Assert.Equal(0, await AttendanceSettler.RunAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope.ServiceProvider.GetRequiredService<StudioClock>(), default));
    }

    [Fact]
    public async Task Outbox_retries_only_failed_alerts_and_respects_visibility_delay()
    {
        var (id, student) = await app.Student();
        var bad = Guid.NewGuid(); var good = Guid.NewGuid();
        await app.Db(async db =>
        {
            foreach (var alertId in new[] { bad, good }) db.Alerts.Add(new Alert { Id = alertId, UserId = id, Kind = AlertKind.Payment, Title = "通知", Body = "內容", CreatedAtUtc = app.Clock.GetUtcNow().UtcDateTime, SendAfterUtc = app.Clock.GetUtcNow().UtcDateTime.AddSeconds(10) });
            return await db.SaveChangesAsync();
        });
        app.Channel.Failing.Add(bad);
        var dispatcher = new AlertDispatcher(app.Services.GetRequiredService<IServiceScopeFactory>(), NullLogger<AlertDispatcher>.Instance);
        await dispatcher.DispatchAsync(default); Assert.Empty(app.Channel.Attempts);
        Assert.Empty((await student.GetFromJsonAsync<JsonArray>("/api/student/alerts"))!);
        app.Clock.Advance(TimeSpan.FromSeconds(11));
        await Task.WhenAll(dispatcher.DispatchAsync(default), dispatcher.DispatchAsync(default));
        Assert.Equal(1, app.Channel.Attempts[good]); Assert.Equal(1, app.Channel.Attempts[bad]);
        app.Channel.Failing.Clear(); app.Clock.Advance(TimeSpan.FromSeconds(11));
        await dispatcher.DispatchAsync(default);
        Assert.Equal(1, app.Channel.Attempts[good]); Assert.Equal(2, app.Channel.Attempts[bad]);
        Assert.Equal(2, await app.Db(db => db.Alerts.CountAsync(a => a.DeliveredAtUtc != null)));
    }

    [Fact]
    public async Task Availability_uses_override_full_fit_and_gap_overlap_after_settings_change()
    {
        var (_, student) = await app.Student(); using var teacher = await app.Login();
        await Book(student);
        (await teacher.PutAsJsonAsync("/api/teacher/availability/settings", new { lessonMinutes = 30, gapMinutes = 0, advanceDays = 30 })).EnsureSuccessStatusCode();
        var slots = (await student.GetFromJsonAsync<JsonArray>($"/api/slots?date={Date}"))!;
        Assert.Equal("full", slots.Single(s => s!["time"]!.GetValue<string>() == "10:00")!["state"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Conflict, (await Post(student, "/api/student/lessons", new { date = Date, time = "10:00" })).StatusCode);
        (await teacher.PutAsJsonAsync($"/api/teacher/availability/overrides/{Date}", new { closed = false, ranges = new[] { new { start = "14:00", end = "15:00" } } })).EnsureSuccessStatusCode();
        Assert.Equal(2, (await student.GetFromJsonAsync<JsonArray>($"/api/slots?date={Date}"))!.Count);
        Assert.Equal(1, await app.Db(db => db.Lessons.CountAsync()));
    }

    [Fact]
    public async Task Malformed_input_cross_site_requests_and_unknown_api_return_problem_json()
    {
        using var client = app.Anonymous();
        var missing = await client.GetAsync("/api/missing");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode); Assert.Equal("application/problem+json", missing.Content.Headers.ContentType!.MediaType);
        var malformed = await client.PostAsJsonAsync("/api/auth/register", new { name = "x", email = "bad", password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        using var csrf = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout"); csrf.Headers.Add("Origin", "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(csrf)).StatusCode);
        var line = await client.GetAsync("/api/auth/line?returnUrl=/\\evil.example");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, line.StatusCode);
    }
    [Fact]
    public async Task Consult_is_persisted_and_rate_limited_per_ip()
    {
        using var visitor = app.Anonymous();
        for (var i = 0; i < 5; i++)
            (await Post(visitor, "/api/public/consults", new { name = "新學生", contactType = "email", contact = "visitor@test.local", preferredTime = "weekend", topic = "試上課" })).EnsureSuccessStatusCode();
        var limited = await Post(visitor, "/api/public/consults", new { name = "x", contactType = "line", contact = "line-id", preferredTime = "any" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("application/problem+json", limited.Content.Headers.ContentType!.MediaType);
        using var teacher = await app.Login();
        var consults = (await teacher.GetFromJsonAsync<JsonArray>("/api/teacher/consults"))!;
        Assert.Equal(5, consults.Count);
        (await Post(teacher, $"/api/teacher/consults/{consults[0]!["id"]}/contacted", new { contacted = true })).EnsureSuccessStatusCode();
        Assert.Equal(4, await app.Db(db => db.Consults.CountAsync(c => !c.Contacted)));
    }

    [Fact]
    public async Task Student_request_approval_and_undo_restore_original_slot_and_remove_alert()
    {
        var (_, student) = await app.Student(); using var teacher = await app.Login();
        var lesson = await Book(student);
        var request = await Json(await Post(student, $"/api/student/lessons/{lesson}/change-requests", new { date = Date, time = "14:00", reason = "工作" }));
        var requests = await Json(await teacher.GetAsync("/api/teacher/requests"));
        Assert.True(requests["changes"]![0]!["slotFree"]!.GetValue<bool>());
        (await teacher.PostAsync($"/api/teacher/change-requests/{request["id"]}/approve", null)).EnsureSuccessStatusCode();
        Assert.Equal(new TimeOnly(14, 0), await app.Db(db => db.Lessons.Select(l => l.Time).SingleAsync()));
        (await teacher.PostAsync($"/api/teacher/change-requests/{request["id"]}/undo", null)).EnsureSuccessStatusCode();
        Assert.Equal(new TimeOnly(9, 30), await app.Db(db => db.Lessons.Select(l => l.Time).SingleAsync()));
        Assert.Equal(ChangeStatus.Open, await app.Db(db => db.ChangeRequests.Select(c => c.Status).SingleAsync()));
        Assert.Equal(0, await app.Db(db => db.Alerts.CountAsync()));
    }

    [Fact]
    public async Task Proposal_acceptance_rechecks_taken_slot_and_keeps_original_lesson()
    {
        var (_, student) = await app.Student(); var (_, other) = await app.Student(); using var teacher = await app.Login();
        var lesson = await Book(student);
        var proposal = await Json(await Post(teacher, $"/api/teacher/lessons/{lesson}/proposals", new { date = Date, time = "14:00" }));
        await Book(other, "14:00");
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/student/change-requests/{proposal["id"]}/accept", null)).StatusCode);
        Assert.Equal(new TimeOnly(9, 30), await app.Db(db => db.Lessons.Where(l => l.Id == lesson).Select(l => l.Time).SingleAsync()));
        (await student.PostAsync($"/api/student/change-requests/{proposal["id"]}/decline", null)).EnsureSuccessStatusCode();
        Assert.Equal(ChangeStatus.Declined, await app.Db(db => db.ChangeRequests.Select(c => c.Status).SingleAsync()));
    }

    [Theory]
    [InlineData(SKEncodedImageFormat.Jpeg)]
    [InlineData(SKEncodedImageFormat.Webp)]
    public async Task Receipt_format_is_detected_from_bytes_instead_of_extension(SKEncodedImageFormat format)
    {
        var (_, student) = await app.Student();
        var payment = await Json(await Upload(student, Image(format)));
        var receipt = await student.GetAsync(payment["receiptUrl"]!.GetValue<string>());
        Assert.Equal(format == SKEncodedImageFormat.Jpeg ? "image/jpeg" : "image/webp", receipt.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Profile_cannot_change_role_or_credits_and_invalid_class_type_is_rejected()
    {
        var (id, student) = await app.Student(2); using var teacher = await app.Login();
        (await student.PutAsJsonAsync("/api/student/profile", new { name = "修改姓名", credits = 999, role = "Teacher" })).EnsureSuccessStatusCode();
        Assert.Equal(2, await Credits(id));
        Assert.Equal(Role.Student, await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.Role).SingleAsync()));
        Assert.Equal(HttpStatusCode.BadRequest, (await student.PutAsJsonAsync("/api/student/profile", new { email = "invalid" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await teacher.PatchAsJsonAsync($"/api/teacher/students/{id}/class-type", new { classType = "999" })).StatusCode);
        (await teacher.PatchAsJsonAsync($"/api/teacher/students/{id}/grade", new { grade = "Grade 3" })).EnsureSuccessStatusCode();
        Assert.Equal("Grade 3", await app.Db(db => db.Users.Where(u => u.Id == id).Select(u => u.Grade).SingleAsync()));
    }

}
