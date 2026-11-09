using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using IrisStudio.Api.Data;
using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

public enum EmailAudience { Student, Teacher, Guest }
/// <summary>Which user switch can turn a template off. Required = account, security, payment and consult emails.</summary>
public enum EmailPreference { Required, Updates, Reminders }

/// <summary>
/// One email. Every text may use {{variables}}; a detail row or paragraph whose variables are all empty is left out.
/// CtaUrl is a site path ("/app") or a variable holding one; the renderer prefixes Notifications:BaseUrl.
/// </summary>
public sealed record EmailTemplate(
    string Key, string Group, string Subject, string Heading, string Preheader,
    string[] Paragraphs, (string Label, string Value)[] Details, string Cta, string CtaUrl, string? Note = null,
    EmailAudience Audience = EmailAudience.Student, EmailPreference Preference = EmailPreference.Required,
    EmailCategory Category = EmailCategory.Transactional, bool Sensitive = false);

/// <summary>All IRIS Studio emails (繁體中文). Keys are stored in EmailMessage.Template, so never rename one.</summary>
public static class EmailTemplates
{
    public static readonly EmailTemplate[] All =
    [
        // ---------- 帳號 ----------
        new("verify-email", "帳號", "請驗證你的 Email", "確認你的 Email", "點一下按鈕，完成 Email 驗證。",
            ["請點下方按鈕，確認這是你的 Email。之後的預約與付款通知都會寄到這裡。"],
            [("Email", "{{email}}"), ("連結有效時間", "{{expiresIn}}")],
            "驗證 Email", "{{verifyUrl}}", "如果你沒有在 IRIS Studio 建立帳號或修改 Email，可以直接忽略這封信。連結只能使用一次。",
            Sensitive: true),
        new("registration-pending", "帳號", "已收到你的帳號申請", "謝謝你的申請", "Iris 確認後，就能開始預約課程。",
            ["我們已收到你的帳號申請。Iris 確認後會為你開通帳號，完成時會再寄信通知你。"],
            [("姓名", "{{recipientName}}"), ("Email", "{{email}}"), ("狀態", "等待老師確認")],
            "查看申請狀態", "/pending"),
        new("account-approved", "帳號", "帳號已開通，歡迎加入 IRIS Studio", "歡迎加入 IRIS Studio", "你的帳號已開通，現在就能預約第一堂課。",
            ["Iris 已確認你的帳號，現在可以開始預約課程了。",
             "上課前，歡迎先到「我的」填寫聲部與想達成的目標，讓 Iris 更了解你。"],
            [], "預約第一堂課", "/app/book"),
        new("password-reset", "帳號", "重設你的 IRIS Studio 密碼", "重設密碼", "點一下按鈕，設定新的密碼。",
            ["我們收到了重設密碼的申請。請點下方按鈕設定新密碼。"],
            [("連結有效時間", "{{expiresIn}}")],
            "設定新密碼", "{{resetUrl}}", "如果不是你本人申請，請忽略這封信，你的密碼不會改變。重設完成後，所有裝置都需要重新登入。",
            Sensitive: true),

        // ---------- 付款 ----------
        new("payment-reminder", "付款", "繳費提醒", "續購課程提醒", "想繼續上課的話，可以先續購方案。",
            ["{{message}}"],
            [("目前剩餘", "{{credits}} 堂")],
            "前往堂數與付款", "/app/quota", "如果已經匯款，請上傳匯款證明；已上傳的話可以忽略這封信。",
            Preference: EmailPreference.Reminders),
        new("receipt-uploaded", "付款", "已收到你的匯款證明", "匯款證明已送出", "Iris 確認後，堂數會自動加入。",
            ["謝謝你！Iris 會盡快確認，確認後堂數會自動加入你的帳號。"],
            [("方案", "{{packageName}}"), ("金額", "{{amount}}"), ("上傳時間", "{{uploadedAt}}")],
            "查看付款狀態", "/app/quota"),
        new("payment-confirmed", "付款", "付款已確認，堂數已加入", "付款確認完成", "{{creditsAdded}} 堂已加入你的帳號。",
            ["謝謝你！付款已確認，堂數已經加入你的帳號。"],
            [("方案", "{{packageName}}"), ("金額", "{{amount}}"), ("新增堂數", "{{creditsAdded}} 堂"), ("目前剩餘", "{{credits}} 堂")],
            "預約下一堂課", "/app/book"),
        new("receipt-rejected", "付款", "匯款證明需要重新上傳", "匯款證明未通過確認", "請參考原因後重新上傳。",
            ["Iris 目前無法確認這筆匯款，請參考下方原因後重新上傳。"],
            [("方案", "{{packageName}}"), ("金額", "{{amount}}"), ("原因", "{{reason}}")],
            "重新上傳", "/app/quota", "有任何疑問，歡迎透過 LINE 或 Email 聯絡工作室。"),

        // ---------- 預約 ----------
        new("booking-confirmed", "預約", "預約成功｜{{classDate}} {{classTime}}", "預約成功", "{{classDate}} {{classTime}}，期待和你見面。",
            ["{{intro}}"],
            [("日期", "{{classDate}}"), ("時間", "{{classTime}}（{{minutes}} 分鐘）"), ("課程", "{{lessonType}}"), ("地點", "{{room}}"), ("剩餘堂數", "{{credits}} 堂")],
            "查看我的課程", "/app", "需要取消的話，請在上課 {{cancelHours}} 小時前到預約頁面操作，堂數會退回。",
            Preference: EmailPreference.Updates),
        new("class-reminder", "預約", "上課提醒｜{{classDate}} {{classTime}}", "課程即將開始", "下一堂課將在 24 小時內開始。",
            ["提醒你，下一堂課將在 24 小時內開始。記得多喝溫水，提早幾分鐘到，讓聲音好好暖身。"],
            [("日期", "{{classDate}}"), ("時間", "{{classTime}}（{{minutes}} 分鐘）"), ("課程", "{{lessonType}}"), ("地點", "{{room}}")],
            "查看課程", "/app", "如果臨時無法上課，請到預約頁面取消。上課前 {{cancelHours}} 小時內取消，堂數將不退回。",
            Preference: EmailPreference.Reminders),
        new("reschedule-received", "預約", "已收到你的改時間申請", "改時間申請已送出", "Iris 確認後會通知你結果。",
            ["Iris 確認後會通知你結果。在那之前，原本的時段仍然保留給你。"],
            [("原時段", "{{fromSlot}}"), ("希望改到", "{{toSlot}}"), ("原因", "{{reason}}")],
            "查看申請", "/app", Preference: EmailPreference.Updates),
        new("reschedule-approved", "預約", "改時間成功｜{{toSlot}}", "改時間成功", "新的上課時間：{{toSlot}}",
            ["Iris 已同意你的改時間申請，新的上課時間如下。"],
            [("原時段", "{{fromSlot}}"), ("新時段", "{{toSlot}}"), ("地點", "{{room}}")],
            "查看我的課程", "/app", Preference: EmailPreference.Updates),
        new("reschedule-declined", "預約", "改時間申請結果", "這次無法改到這個時段", "原本的課程維持不變。",
            ["很抱歉，Iris 這次無法安排你希望的時段，原本的課程維持不變。"],
            [("原時段（維持）", "{{slot}}"), ("希望改到", "{{toSlot}}"), ("老師留言", "{{teacherMessage}}")],
            "選擇其他時段", "/app", Preference: EmailPreference.Updates),
        new("reschedule-proposed", "預約", "Iris 想和你調整上課時間", "老師提議新的上課時間", "需要你回覆，才會更改時間。",
            ["Iris 想把這堂課調整到新的時段，需要你同意才會更改。"],
            [("原時段", "{{fromSlot}}"), ("提議時段", "{{toSlot}}"), ("老師留言", "{{teacherMessage}}")],
            "回覆老師", "/app", "在你回覆之前，原本的時段仍然保留給你。", Preference: EmailPreference.Updates),
        new("booking-cancelled", "預約", "課程已取消｜{{classDate}} {{classTime}}", "課程已取消", "{{classDate}} {{classTime}} 的課程已取消。",
            ["{{intro}}"],
            [("日期", "{{classDate}}"), ("時間", "{{classTime}}"), ("堂數", "{{refund}}"), ("目前剩餘", "{{credits}} 堂")],
            "重新預約", "/app/book", Preference: EmailPreference.Updates),
        new("credits-returned", "預約", "堂數已退回 {{delta}} 堂", "堂數已加回你的帳號", "目前剩餘 {{credits}} 堂。",
            ["Iris 已將 {{delta}} 堂加回你的帳號，可以直接預約課程。"],
            [("退回", "{{delta}} 堂"), ("目前剩餘", "{{credits}} 堂")],
            "預約課程", "/app/book", Preference: EmailPreference.Updates),
        new("credits-updated", "預約", "你的堂數已調整", "堂數已調整", "目前剩餘 {{credits}} 堂。",
            ["Iris 調整了你的堂數。如果有任何疑問，歡迎聯絡工作室。"],
            [("調整", "{{delta}} 堂"), ("目前剩餘", "{{credits}} 堂")],
            "查看堂數", "/app/quota", Preference: EmailPreference.Updates),
        new("credits-low", "預約", "只剩 {{credits}} 堂課囉", "堂數快用完了", "想繼續上課，可以先續購方案。",
            ["你的方案只剩 {{credits}} 堂。想繼續上課的話，可以先續購，付款確認後堂數會直接加入。"],
            [("目前剩餘", "{{credits}} 堂")],
            "查看方案", "/app/quota", Preference: EmailPreference.Reminders),

        // ---------- 諮詢 ----------
        new("consult-received", "諮詢", "已收到你的諮詢", "謝謝你的諮詢", "Iris 會依你方便的時段與你聯絡。",
            ["我們已收到你的免費諮詢，Iris 會依你方便的時段與你聯絡。"],
            [("方便聯絡", "{{preferredTime}}"), ("想了解", "{{topic}}")],
            "認識 IRIS Studio", "/", Audience: EmailAudience.Guest),
        new("consult-scheduled", "諮詢", "諮詢時間確認｜{{consultDate}} {{consultTime}}", "諮詢時間已安排", "{{consultDate}} {{consultTime}}，期待和你聊聊。",
            ["Iris 已為你安排免費諮詢，期待和你聊聊。"],
            [("日期", "{{consultDate}}"), ("時間", "{{consultTime}}（台北時間，UTC+8）"), ("備註", "{{note}}")],
            "認識 IRIS Studio", "/", "如需更改時間，請聯絡工作室。", Audience: EmailAudience.Guest),

        // ---------- 老師 ----------
        new("teacher-new-registration", "老師", "新的學生申請：{{studentName}}", "有新的學生申請", "{{studentName}} 正在等待你確認。",
            ["{{studentName}} 建立了帳號，正在等待你確認。"],
            [("姓名", "{{studentName}}"), ("登入方式", "{{contact}}"), ("申請時間", "{{registeredAt}}")],
            "查看申請", "/teacher/requests", Audience: EmailAudience.Teacher, Preference: EmailPreference.Updates),
        new("teacher-payment-pending", "老師", "待確認付款：{{studentName}} {{amount}}", "有一筆付款等待確認", "{{studentName}} 上傳了匯款證明。",
            ["{{studentName}} 上傳了匯款證明，確認後堂數會自動加入學生帳號。"],
            [("學生", "{{studentName}}"), ("方案", "{{packageName}}"), ("金額", "{{amount}}"), ("上傳時間", "{{uploadedAt}}")],
            "確認付款", "/teacher/payments", Audience: EmailAudience.Teacher, Preference: EmailPreference.Updates),
        new("teacher-reschedule-request", "老師", "改時間申請：{{studentName}}", "有新的改時間申請", "{{studentName}} 想調整上課時間。",
            ["{{studentName}} 想調整上課時間，新時段需要你確認。"],
            [("學生", "{{studentName}}"), ("原時段", "{{fromSlot}}"), ("希望改到", "{{toSlot}}"), ("原因", "{{reason}}")],
            "處理申請", "/teacher/requests", Audience: EmailAudience.Teacher, Preference: EmailPreference.Updates),
        new("teacher-new-consult", "老師", "新的諮詢：{{consultName}}", "有人留下了諮詢", "{{consultName}} 想了解課程。",
            ["{{consultName}} 留下了免費諮詢，想了解課程。"],
            [("姓名", "{{consultName}}"), ("聯絡方式", "{{contact}}"), ("方便時段", "{{preferredTime}}"), ("想了解", "{{topic}}")],
            "查看諮詢", "/teacher/consults", Audience: EmailAudience.Teacher, Preference: EmailPreference.Updates),

        // ---------- 行銷（需同意，可一鍵取消訂閱）----------
        new("studio-news", "行銷", "{{headline}}", "{{headline}}", "{{preheader}}",
            ["{{body}}"], [], "了解更多", "{{actionPath}}", Category: EmailCategory.Marketing),
    ];

    private static readonly Dictionary<string, EmailTemplate> ByKey = All.ToDictionary(t => t.Key);

    public static EmailTemplate Get(string key) =>
        ByKey.TryGetValue(key, out var t) ? t : throw new InvalidOperationException($"Unknown email template '{key}'.");

    public static bool Exists(string key) => ByKey.ContainsKey(key);

    /// <summary>Example values for previews and test emails. Covers every variable used above.</summary>
    public static IReadOnlyDictionary<string, string> Sample(EmailTemplate t) => new Dictionary<string, string>
    {
        ["recipientName"] = t.Audience == EmailAudience.Teacher ? "Iris" : "王小美",
        ["email"] = "student@example.com", ["expiresIn"] = "48 小時",
        ["verifyUrl"] = "/verify-email?token=preview", ["resetUrl"] = "/reset-password?token=preview",
        ["message"] = "你的堂數已經用完了。想繼續上課的話，請到「堂數與付款」上傳匯款證明。", ["credits"] = "1",
        ["packageName"] = "4 堂方案", ["amount"] = "NT$3,200", ["uploadedAt"] = "2026年11月8日 14:30", ["creditsAdded"] = "4",
        ["reason"] = "匯款金額和方案不符，請確認後重新上傳。",
        ["intro"] = t.Key == "booking-cancelled" ? "你已取消這堂課。" : "你的課程已經預約完成，期待和你見面。", ["classDate"] = "2026年11月20日（五）", ["classTime"] = "19:00",
        ["minutes"] = "60", ["lessonType"] = "一對一", ["room"] = "A 教室", ["cancelHours"] = "24",
        ["fromSlot"] = "2026年11月20日（五）19:00", ["toSlot"] = "2026年11月22日（日）15:00", ["slot"] = "2026年11月20日（五）19:00",
        ["teacherMessage"] = "這週末比較滿，下週三晚上可以嗎？", ["refund"] = "已退回 1 堂", ["delta"] = "1",
        ["preferredTime"] = "平日晚上", ["topic"] = "想準備音樂班術科考試", ["consultDate"] = "2026年11月15日（日）", ["consultTime"] = "14:00",
        ["note"] = "線上視訊：https://meet.google.com/abc-defg-hij", ["studentName"] = "王小美", ["contact"] = "student@example.com",
        ["registeredAt"] = "2026年11月8日 14:30", ["consultName"] = "陳先生",
        ["headline"] = "冬季發聲工作坊開放報名", ["preheader"] = "12 月限定，名額有限。",
        ["body"] = "12 月我們將舉辦兩場小班發聲工作坊，適合想打好基礎的你。", ["actionPath"] = "/",
    };
}

/// <summary>Studio-time (Asia/Taipei) formats used in emails.</summary>
public static class EmailFormat
{
    private static readonly string[] Weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    public static string Date(DateOnly d) => $"{d.Year}年{d.Month}月{d.Day}日（{Weekdays[(int)d.DayOfWeek]}）";
    public static string Time(TimeOnly t) => t.ToString("HH:mm");
    public static string Slot(DateOnly d, TimeOnly t) => $"{Date(d)}{Time(t)}";
    public static string Local(DateTime local) => $"{local.Year}年{local.Month}月{local.Day}日 {local:HH:mm}";
    public static string Money(int amount) => $"NT${amount:N0}";
    public static string Package(Payment p) => p.IsTrial ? "體驗課（1 堂）" : $"{p.PackageSize} 堂方案";
    public static string LessonType(LessonType t) => t switch { Data.LessonType.Group => "團體課", Data.LessonType.Trial => "體驗課", _ => "一對一" };
    public static string ConsultTime(string key) => key switch
    {
        "weekdayDay" => "平日白天", "weekdayEvening" => "平日晚上", "weekend" => "週末", _ => "都可以",
    };

    /// <summary>Variables for any lesson email, plus the hidden guard fields (lesson must still be in this state at this slot).</summary>
    public static Dictionary<string, string> Lesson(Lesson l, StudioOptions o, LessonStatus expect) => new()
    {
        ["classDate"] = Date(l.Date), ["classTime"] = Time(l.Time), ["minutes"] = l.DurationMinutes.ToString(),
        ["lessonType"] = LessonType(l.Type), ["room"] = o.Room, ["cancelHours"] = o.CancelHours.ToString(),
        [EmailGuard.LessonId] = l.Id.ToString(), [EmailGuard.LessonSlot] = SlotKey(l.Date, l.Time), [EmailGuard.LessonStatus] = expect.ToString(),
    };

    public static string SlotKey(DateOnly d, TimeOnly t) => $"{d:yyyyMMdd}{t:HHmm}";
}

/// <summary>Hidden data fields checked right before sending: the email goes out only if the business state still matches.</summary>
public static class EmailGuard
{
    public const string LessonId = "_lessonId", LessonSlot = "_lessonSlot", LessonStatus = "_lessonStatus";
    public const string ChangeId = "_changeId", ChangeStatus = "_changeStatus";
    public const string PaymentId = "_paymentId", PaymentStatus = "_paymentStatus";
    public const string TokenId = "_tokenId";
    public const string ConsultId = "_consultId", ConsultSlot = "_consultSlot";
}

/// <summary>Only a direct HTTPS Google Meet URL in the teacher's note becomes the email's meeting button.</summary>
public static partial class ConsultMeetingLink
{
    [GeneratedRegex("https?://[^\\s<>\"'「」『』（）【】，。；、！？]+", RegexOptions.IgnoreCase)]
    private static partial Regex Links();

    public static string? FromNote(string? note)
    {
        foreach (Match match in Links().Matches(note ?? ""))
        {
            var candidate = match.Value.TrimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}');
            if (!candidate.Contains('\\') && Uri.TryCreate(candidate, UriKind.Absolute, out var uri)
                && uri.Scheme == "https" && uri.Host.Equals("meet.google.com", StringComparison.OrdinalIgnoreCase)
                && uri.IsDefaultPort && uri.UserInfo.Length == 0 && uri.AbsolutePath.Length > 1)
                return uri.AbsoluteUri;
        }
        return null;
    }
}

public sealed record RenderedEmail(string Subject, string Html, string Text);

/// <summary>One responsive layout for every template: logo → heading → greeting → message → detail card → button → footer.</summary>
public sealed partial class EmailRenderer(IOptions<NotificationOptions> options, StudioClock clock)
{
    // Brand palette. The button uses dark forest: white text on sage (#667D6B) is below WCAG AA contrast.
    private const string Ivory = "#F3EDE4", Paper = "#FFFDF9", Sage = "#667D6B", Forest = "#203129", Muted = "#55665B", Line = "#E4DCCF";
    private const string Sans = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Arial,sans-serif";
    private const string Serif = "Georgia,'Times New Roman','Noto Serif TC',serif";

    [GeneratedRegex(@"\{\{(\w+)\}\}")]
    private static partial Regex Placeholder();

    public RenderedEmail Render(EmailTemplate t, IReadOnlyDictionary<string, string> data, string? unsubscribeUrl = null)
    {
        var o = options.Value;
        var site = BaseUrl(o);
        string Value(Match m) => data.TryGetValue(m.Groups[1].Value, out var v)
            ? v : throw new InvalidOperationException($"Email template '{t.Key}' needs '{m.Groups[1].Value}'.");
        string Raw(string s) => Placeholder().Replace(s, Value);
        // optional parts (留言、原因、備註…): a text whose variables are all empty is left out
        bool Blank(string s) => Placeholder().Matches(s) is { Count: > 0 } ms && ms.All(m => string.IsNullOrWhiteSpace(Value(m)));
        static string H(string s) => WebUtility.HtmlEncode(s).Replace("\r\n", "\n").Replace("\n", "<br>");
        string Url(string path) => path.StartsWith('/') ? site + path : path;

        var subject = Raw(t.Subject);
        var heading = Raw(t.Heading);
        var greeting = $"{Raw("{{recipientName}}")}，你好：";
        var paragraphs = t.Paragraphs.Where(p => !Blank(p)).Select(Raw).ToArray();
        var details = t.Details.Where(d => !Blank(d.Value)).Select(d => (d.Label, Value: Raw(d.Value))).ToArray();
        var meet = t.Key == "consult-scheduled" ? ConsultMeetingLink.FromNote(data.GetValueOrDefault("note")) : null;
        var ctaLabel = meet is null ? t.Cta : "加入 Google Meet";
        var cta = meet ?? Url(Raw(t.CtaUrl));
        if (!Uri.TryCreate(cta, UriKind.Absolute, out var ctaUri) || ctaUri.Scheme is not ("https" or "http"))
            throw new InvalidOperationException($"Email template '{t.Key}' produced an invalid link.");
        var note = t.Note is null || Blank(t.Note) ? null : Raw(t.Note);
        var settings = t.Audience switch { EmailAudience.Student => site + "/app/profile", EmailAudience.Teacher => site + "/teacher/profile", _ => null };
        var privacy = site + "/legal/privacy";
        var year = clock.LocalNow.Year;
        var contact = string.Join(" · ", new[] { o.ContactEmail is { Length: > 0 } e ? $"Email {e}" : null, o.ContactLine is { Length: > 0 } l ? $"LINE {l}" : null }.Where(x => x is not null));
        var why = t.Category == EmailCategory.Marketing
            ? "你會收到這封信，是因為你同意接收 IRIS Studio 的行銷訊息。"
            : "這是與你的帳號、預約或付款有關的服務通知。";

        // ---------- HTML ----------
        var html = new StringBuilder();
        html.Append($"""
            <!DOCTYPE html>
            <html lang="zh-Hant" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
            <head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
            <title>{H(subject)}</title>
            <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,span{"{"}font-family:'Microsoft JhengHei',Arial,sans-serif !important;{"}"}</style><![endif]-->
            <style>
            body{"{"}margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;{"}"}
            a{"{"}color:{Forest};{"}"}
            @media only screen and (max-width:620px){"{"}
              .px{"{"}padding-left:24px !important;padding-right:24px !important;{"}"}
              .pt{"{"}padding-top:32px !important;{"}"}
              .h1{"{"}font-size:22px !important;line-height:30px !important;{"}"}
              .dl,.dv{"{"}display:block !important;width:100% !important;text-align:left !important;{"}"}
              .dl{"{"}border-bottom:0 !important;padding-bottom:0 !important;{"}"}
              .dv{"{"}padding-top:2px !important;{"}"}
              .btnt{"{"}width:100% !important;{"}"}
              .btn,.btn a{"{"}display:block !important;width:100% !important;box-sizing:border-box;text-align:center !important;{"}"}
            {"}"}
            </style>
            </head>
            <body style="margin:0;padding:0;background-color:{Ivory};">
            <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:{Ivory};">{H(Raw(t.Preheader))}{string.Concat(Enumerable.Repeat("&#8199;&#65279;&#847; ", 40))}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{Ivory};">
            <tr><td align="center" style="padding:32px 12px;">
            <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
            <tr><td align="center" style="padding:0 0 24px;">
              <div style="font-family:{Serif};font-size:28px;line-height:32px;letter-spacing:10px;color:{Forest};padding-left:10px;">IRIS</div>
              <div style="font-family:{Sans};font-size:11px;line-height:16px;letter-spacing:5px;color:{Sage};padding-left:5px;">STUDIO</div>
            </td></tr>
            <tr><td class="px pt" style="background-color:{Paper};border:1px solid {Line};border-radius:16px;padding:44px 44px 40px;font-family:{Sans};color:{Forest};">
              <div style="width:32px;height:2px;background-color:{Sage};font-size:0;line-height:0;margin:0 0 20px;">&nbsp;</div>
              <h1 class="h1" style="margin:0 0 20px;font-family:{Serif};font-size:26px;line-height:34px;font-weight:normal;color:{Forest};">{H(heading)}</h1>
              <p style="margin:0 0 12px;font-size:16px;line-height:26px;color:{Forest};">{H(greeting)}</p>
            """);
        foreach (var p in paragraphs)
            html.Append($"""<p style="margin:0 0 12px;font-size:16px;line-height:26px;color:{Forest};">{H(p)}</p>""").Append('\n');
        if (details.Length > 0)
        {
            html.Append($"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;background-color:{Ivory};border-radius:12px;"><tr><td style="padding:8px 20px;">""").Append('\n');
            for (var i = 0; i < details.Length; i++)
            {
                var border = i < details.Length - 1 ? $"border-bottom:1px solid {Line};" : "";
                html.Append($"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="dl" width="34%" valign="top" style="padding:12px 0;{border}font-size:14px;line-height:22px;color:{Muted};">{H(details[i].Label)}</td><td class="dv" valign="top" style="padding:12px 0;{border}font-size:15px;line-height:22px;color:{Forest};font-weight:600;">{H(details[i].Value)}</td></tr></table>""").Append('\n');
            }
            html.Append("</td></tr></table>\n");
        }
        var href = WebUtility.HtmlEncode(cta);
        html.Append($"""
              <table class="btnt" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;"><tr><td class="btn" align="center" bgcolor="{Forest}" style="border-radius:999px;background-color:{Forest};">
                <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{href}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="50%" stroke="f" fillcolor="{Forest}"><center style="color:{Ivory};font-family:'Microsoft JhengHei',Arial,sans-serif;font-size:16px;font-weight:bold;">{H(ctaLabel)}</center></v:roundrect><![endif]-->
                <!--[if !mso]><!--><a href="{href}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:{Sans};font-size:16px;line-height:20px;font-weight:600;color:{Ivory};text-decoration:none;border-radius:999px;">{H(ctaLabel)}</a><!--<![endif]-->
              </td></tr></table>
              <p style="margin:12px 0 0;font-size:13px;line-height:20px;color:{Muted};">按鈕無法使用時，請複製此連結到瀏覽器：<br><a href="{href}" style="color:{Muted};word-break:break-all;">{WebUtility.HtmlEncode(cta)}</a></p>
            """);
        if (note is not null)
            html.Append($"""<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid {Line};font-size:14px;line-height:22px;color:{Muted};">{H(note)}</p>""").Append('\n');
        html.Append($"""
            </td></tr>
            <tr><td class="px" align="center" style="padding:28px 44px 8px;font-family:{Sans};font-size:12px;line-height:20px;color:{Muted};">
              <p style="margin:0 0 6px;font-weight:600;color:{Forest};">IRIS 聲樂工作室</p>
            """);
        if (contact.Length > 0) html.Append($"""<p style="margin:0 0 6px;">{H(contact)}</p>""").Append('\n');
        html.Append($"""<p style="margin:0 0 6px;">{H(why)}</p>""").Append('\n');
        var links = new List<string> { $"""<a href="{WebUtility.HtmlEncode(privacy)}" style="color:{Muted};">隱私權政策</a>""" };
        if (settings is not null) links.Add($"""<a href="{WebUtility.HtmlEncode(settings)}" style="color:{Muted};">通知設定</a>""");
        if (unsubscribeUrl is not null) links.Add($"""<a href="{WebUtility.HtmlEncode(unsubscribeUrl)}" style="color:{Muted};">取消訂閱</a>""");
        html.Append($"""<p style="margin:0 0 6px;">{string.Join(" ・ ", links)}</p>""").Append('\n');
        html.Append($"""
              <p style="margin:0;">© {year} IRIS Studio. All rights reserved.</p>
            </td></tr>
            </table>
            <!--[if mso]></td></tr></table><![endif]-->
            </td></tr></table>
            </body></html>
            """);

        // ---------- plain text fallback ----------
        var text = new StringBuilder();
        text.AppendLine("IRIS Studio").AppendLine().AppendLine(heading).AppendLine().AppendLine(greeting).AppendLine();
        foreach (var p in paragraphs) text.AppendLine(p).AppendLine();
        foreach (var (label, value) in details) text.AppendLine($"{label}：{value}");
        if (details.Length > 0) text.AppendLine();
        text.AppendLine($"{ctaLabel}：{cta}").AppendLine();
        if (note is not null) text.AppendLine(note).AppendLine();
        text.AppendLine("——").AppendLine("IRIS 聲樂工作室");
        if (contact.Length > 0) text.AppendLine(contact);
        text.AppendLine(why).AppendLine($"隱私權政策：{privacy}");
        if (settings is not null) text.AppendLine($"通知設定：{settings}");
        if (unsubscribeUrl is not null) text.AppendLine($"取消訂閱：{unsubscribeUrl}");
        text.Append($"© {year} IRIS Studio");

        return new RenderedEmail(subject, html.ToString(), text.ToString());
    }

    public static string BaseUrl(NotificationOptions o) =>
        string.IsNullOrWhiteSpace(o.BaseUrl) ? throw new InvalidOperationException("Set Notifications:BaseUrl (the public site address used in email links).") : o.BaseUrl.TrimEnd('/');
}
