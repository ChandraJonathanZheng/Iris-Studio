using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace IrisStudio.Api.Services;

/// <summary>
/// Allow-list sanitiser for 課堂筆記 rich text. The editor only makes bold / italic / underline / lists / line breaks, so
/// everything else is dropped: unknown tags lose their tag (the text inside stays), every attribute is removed (no
/// style, no href, no onclick), and script/style content disappears entirely. Never trust the browser's HTML.
/// </summary>
public static partial class NoteHtml
{
    static readonly HashSet<string> Allowed = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "div"];

    [GeneratedRegex(@"<(script|style|iframe|object|embed|template)\b[\s\S]*?</\1\s*>", RegexOptions.IgnoreCase)]
    private static partial Regex Dangerous();
    [GeneratedRegex(@"<!--[\s\S]*?-->")]
    private static partial Regex Comments();
    [GeneratedRegex(@"<\s*(/?)\s*([a-zA-Z0-9]+)[^>]*>")]
    private static partial Regex Tag();

    public static string Clean(string html)
    {
        var s = Dangerous().Replace(html, "");
        s = Comments().Replace(s, "");
        var sb = new StringBuilder();
        var last = 0;
        foreach (Match m in Tag().Matches(s))
        {
            sb.Append(EscapeText(s[last..m.Index]));
            var name = m.Groups[2].Value.ToLowerInvariant();
            if (Allowed.Contains(name)) sb.Append(name == "br" ? "<br>" : $"<{m.Groups[1].Value}{name}>"); // attributes dropped
            last = m.Index + m.Length;
        }
        sb.Append(EscapeText(s[last..]));
        return sb.ToString().Trim();
    }

    /// <summary>The visible text, to reject a note that is only empty tags.</summary>
    public static string PlainText(string cleanHtml) => WebUtility.HtmlDecode(Tag().Replace(cleanHtml, " ")).Trim();

    // text between tags: decode then re-encode, so a stray "<" can never start a tag
    static string EscapeText(string t) => WebUtility.HtmlEncode(WebUtility.HtmlDecode(t));
}
