using IrisStudio.Api.Data;
using IrisStudio.Api.Services;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Tests;

public class EmailTemplateTests
{
    private static EmailRenderer Renderer() => new(
        Options.Create(new NotificationOptions { BaseUrl = "https://iris.test/", ContactEmail = "hello@iris.test", ContactLine = "@iris" }),
        new StudioClock(Options.Create(new StudioOptions()), TimeProvider.System));

    public static TheoryData<string> Keys() => new(EmailTemplates.All.Select(t => t.Key));

    [Theory]
    [MemberData(nameof(Keys))]
    public void Every_template_renders_html_and_plain_text_with_its_sample_data(string key)
    {
        var t = EmailTemplates.Get(key);
        var r = Renderer().Render(t, EmailTemplates.Sample(t), t.Category == EmailCategory.Marketing ? "https://iris.test/unsubscribe?t=x" : null);
        Assert.DoesNotContain("{{", r.Subject + r.Html + r.Text);
        Assert.StartsWith("<!DOCTYPE html>", r.Html);
        Assert.Contains("max-width:600px", r.Html);
        Assert.Contains("IRIS", r.Html);
        Assert.Contains("隱私權政策", r.Text);
        Assert.Contains($"© {DateTime.UtcNow.Year} IRIS Studio", r.Html);
        Assert.Contains("hello@iris.test", r.Text);
        Assert.Contains(key == "consult-scheduled" ? "加入 Google Meet：https://meet.google.com/abc-defg-hij" : $"{t.Cta}：https://iris.test", r.Text); // the plain-text part has the full link
        if (Environment.GetEnvironmentVariable("IRIS_EMAIL_PREVIEW_DIR") is { Length: > 0 } dir)
        {
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, $"{key}.html"), r.Html);
            File.WriteAllText(Path.Combine(dir, $"{key}.txt"), r.Text);
        }
    }

    [Fact]
    public void Values_are_html_encoded_but_plain_text_stays_readable()
    {
        var t = EmailTemplates.Get("receipt-rejected");
        var data = new Dictionary<string, string>(EmailTemplates.Sample(t)) { ["recipientName"] = "<script>alert(1)</script>", ["reason"] = "金額 < 方案 & \"錯誤\"" };
        var r = Renderer().Render(t, data);
        Assert.DoesNotContain("<script>", r.Html);
        Assert.Contains("&lt;script&gt;", r.Html);
        Assert.Contains("金額 &lt; 方案 &amp; &quot;錯誤&quot;", r.Html);
        Assert.Contains("原因：金額 < 方案 & \"錯誤\"", r.Text);
    }

    [Fact]
    public void Optional_rows_with_empty_values_are_left_out()
    {
        var t = EmailTemplates.Get("reschedule-declined");
        var data = new Dictionary<string, string>(EmailTemplates.Sample(t)) { ["teacherMessage"] = "" };
        var r = Renderer().Render(t, data);
        Assert.DoesNotContain("老師留言", r.Html);
        Assert.DoesNotContain("老師留言", r.Text);
        Assert.Contains("原時段（維持）", r.Text);
    }

    [Fact]
    public void A_missing_variable_fails_loudly_instead_of_sending_a_broken_email()
    {
        var t = EmailTemplates.Get("booking-confirmed");
        var data = new Dictionary<string, string>(EmailTemplates.Sample(t));
        data.Remove("classDate");
        var error = Assert.Throws<InvalidOperationException>(() => Renderer().Render(t, data));
        Assert.Contains("classDate", error.Message);
    }

    [Fact]
    public void Only_marketing_email_carries_an_unsubscribe_link_and_transactional_email_says_why_it_was_sent()
    {
        var news = EmailTemplates.Get("studio-news");
        var marketing = Renderer().Render(news, EmailTemplates.Sample(news), "https://iris.test/unsubscribe?t=abc");
        Assert.Contains("取消訂閱", marketing.Html);
        Assert.Contains("取消訂閱：https://iris.test/unsubscribe?t=abc", marketing.Text);
        Assert.Contains("同意接收", marketing.Text);
        var booking = EmailTemplates.Get("booking-confirmed");
        var transactional = Renderer().Render(booking, EmailTemplates.Sample(booking));
        Assert.DoesNotContain("取消訂閱", transactional.Html);
        Assert.Contains("服務通知", transactional.Text);
        Assert.Contains("通知設定：https://iris.test/app/profile", transactional.Text);
    }

    [Fact]
    public void Only_verify_and_reset_are_sensitive_and_marketing_is_separate()
    {
        Assert.Equal(["password-reset", "verify-email"], EmailTemplates.All.Where(t => t.Sensitive).Select(t => t.Key).Order());
        Assert.Equal(["studio-news"], EmailTemplates.All.Where(t => t.Category == EmailCategory.Marketing).Select(t => t.Key));
        Assert.Equal(EmailTemplates.All.Length, EmailTemplates.All.Select(t => t.Key).Distinct().Count());
        // the request's required set is all present
        string[] required = ["verify-email", "registration-pending", "account-approved", "password-reset", "payment-reminder", "receipt-uploaded",
            "payment-confirmed", "receipt-rejected", "booking-confirmed", "class-reminder", "reschedule-received", "reschedule-approved",
            "reschedule-declined", "booking-cancelled", "credits-returned", "credits-low", "consult-received", "consult-scheduled",
            "teacher-new-registration", "teacher-payment-pending", "teacher-reschedule-request", "teacher-new-consult"];
        Assert.All(required, k => Assert.True(EmailTemplates.Exists(k), k));
    }

    [Fact]
    public void Lesson_dates_are_studio_time_in_traditional_chinese()
    {
        Assert.Equal("2026年11月20日（五）19:00", EmailFormat.Slot(new DateOnly(2026, 11, 20), new TimeOnly(19, 0)));
        Assert.Equal("NT$3,200", EmailFormat.Money(3200));
    }

    [Theory]
    [InlineData("https://meet.google.com/uhd-nzdk-qan", "https://meet.google.com/uhd-nzdk-qan")]
    [InlineData("線上視訊（https://meet.google.com/uhd-nzdk-qan），請準時加入。", "https://meet.google.com/uhd-nzdk-qan")]
    [InlineData("Join (https://meet.google.com/abc-defg-hij?authuser=0&hs=122).", "https://meet.google.com/abc-defg-hij?authuser=0&hs=122")]
    [InlineData("HTTPS://MEET.GOOGLE.COM/abc-defg-hij", "https://meet.google.com/abc-defg-hij")]
    [InlineData("http://meet.google.com/abc-defg-hij", null)]
    [InlineData("https://meet.google.com.evil.test/abc-defg-hij", null)]
    [InlineData("https://meet.google.com@evil.test/abc-defg-hij", null)]
    [InlineData("https://user@meet.google.com/abc-defg-hij", null)]
    [InlineData("https://meet.google.com:8443/abc-defg-hij", null)]
    [InlineData("https://evil.test/?next=https://meet.google.com/abc-defg-hij", null)]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("https://meet.google.com/", null)]
    [InlineData("線下會面，請到工作室。", null)]
    public void Consult_confirmation_links_to_Meet_only_when_the_note_contains_a_direct_safe_URL(string note, string? meet)
    {
        Assert.Equal(meet, ConsultMeetingLink.FromNote(note));
        var t = EmailTemplates.Get("consult-scheduled");
        var data = new Dictionary<string, string>(EmailTemplates.Sample(t)) { ["note"] = note + " <script>alert(1)</script>" };
        var r = Renderer().Render(t, data);
        Assert.Contains("台北時間，UTC+8", r.Text);
        Assert.DoesNotContain("<script>", r.Html);
        Assert.Contains("&lt;script&gt;", r.Html);
        if (meet is not null)
        {
            Assert.Contains("加入 Google Meet：" + meet, r.Text);
            Assert.Contains("href=\"" + System.Net.WebUtility.HtmlEncode(meet) + "\"", r.Html);
        }
        else
        {
            Assert.Contains("認識 IRIS Studio：https://iris.test/", r.Text);
            Assert.DoesNotContain("加入 Google Meet", r.Html);
        }
    }
}
