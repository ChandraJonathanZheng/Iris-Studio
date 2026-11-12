using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using IrisStudio.Api.Data;
using IrisStudio.Api.Endpoints;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;

namespace IrisStudio.Api.Tests;

/// <summary>精彩片段 (Instagram Reels): max 8, link parsing, thumbnail checks, soft delete + restore, reorder.</summary>
public class ReelTests(StudioFactory app) : IClassFixture<StudioFactory>, IAsyncLifetime
{
    public Task InitializeAsync() => app.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private static byte[] Png(uint color = 0xff667d6b)
    {
        using var bitmap = new SKBitmap(9, 16); bitmap.Erase(new SKColor(color));
        using var data = bitmap.Encode(SKEncodedImageFormat.Png, 90); return data.ToArray();
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string url, string link, byte[]? image)
    {
        var form = new MultipartFormDataContent { { new StringContent(link), "url" } };
        if (image is not null) form.Add(new ByteArrayContent(image), "thumbnail", "cover.png");
        return client.SendAsync(new HttpRequestMessage(method, url) { Content = form });
    }
    private static Task<HttpResponseMessage> Add(HttpClient client, string code, byte[]? image = null) =>
        Send(client, HttpMethod.Post, "/api/teacher/reels", $"https://www.instagram.com/reel/{code}/?igsh=abc", image ?? Png());

    private static async Task<JsonObject> Json(HttpResponseMessage r) { r.EnsureSuccessStatusCode(); return (await r.Content.ReadFromJsonAsync<JsonObject>())!; }
    private static async Task<JsonArray> List(HttpClient c, string url = "/api/teacher/reels") => (await c.GetFromJsonAsync<JsonArray>(url))!;

    [Theory]
    [InlineData("https://www.instagram.com/reel/C9xYz12AbCd/", "C9xYz12AbCd")]
    [InlineData("https://instagram.com/reels/C9xYz12AbCd?igsh=MTc4", "C9xYz12AbCd")]
    [InlineData("https://www.instagram.com/p/DAbc_123-x/", "DAbc_123-x")]
    [InlineData("https://www.instagram.com/iris.voice/reel/C9xYz12AbCd/", "C9xYz12AbCd")]
    [InlineData("  https://m.instagram.com/reel/C9xYz12AbCd/  ", "C9xYz12AbCd")]
    [InlineData("https://www.instagram.com/iris.voice/", null)]
    [InlineData("https://evil.com/instagram.com/reel/C9xYz12AbCd/", null)]
    [InlineData("https://www.instagram.com.evil.com/reel/C9xYz12AbCd/", null)]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("", null)]
    public void Links_are_parsed_strictly(string link, string? expected) => Assert.Equal(expected, ReelEndpoints.ParseShortcode(link));

    [Fact]
    public async Task Teacher_adds_reels_up_to_eight_and_the_link_is_cleaned()
    {
        using var teacher = await app.Login();
        var first = await Json(await Add(teacher, "AAAAA1"));
        Assert.Equal("https://www.instagram.com/reel/AAAAA1/", first["url"]!.GetValue<string>()); // ?igsh tracking removed
        Assert.Equal(1, first["sortOrder"]!.GetValue<int>());
        for (var i = 2; i <= ReelEndpoints.MaxReels; i++) (await Add(teacher, $"AAAAA{i}")).EnsureSuccessStatusCode();

        var ninth = await Add(teacher, "AAAAA9");
        Assert.Equal(HttpStatusCode.Conflict, ninth.StatusCode);
        Assert.Equal(8, (await List(teacher)).Count);

        Assert.Equal(HttpStatusCode.Conflict, (await Add(teacher, "AAAAA1")).StatusCode);
    }

    [Fact]
    public async Task Bad_input_is_rejected_and_students_cannot_manage_reels()
    {
        using var teacher = await app.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(teacher, HttpMethod.Post, "/api/teacher/reels", "https://youtube.com/watch?v=1", Png())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(teacher, HttpMethod.Post, "/api/teacher/reels", "https://www.instagram.com/reel/AAAAA1/", null)).StatusCode);
        // a text file renamed to .png is not an image
        Assert.Equal(HttpStatusCode.BadRequest, (await Add(teacher, "AAAAA1", "not an image"u8.ToArray())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Add(teacher, "AAAAA1", new byte[ReelEndpoints.MaxThumbnailBytes + 1])).StatusCode);

        var (_, student) = await app.Student();
        Assert.Equal(HttpStatusCode.Forbidden, (await Add(student, "AAAAA1")).StatusCode);
        Assert.Equal(0, await app.Db(db => db.InstagramReels.IgnoreQueryFilters().CountAsync()));
    }

    [Fact]
    public async Task Delete_is_soft_restore_puts_it_back_in_place_and_public_list_follows()
    {
        using var teacher = await app.Login(); using var anonymous = app.Anonymous();
        var a = (await Json(await Add(teacher, "AAAAA1")))["id"]!.GetValue<Guid>();
        var b = (await Json(await Add(teacher, "BBBBB2")))["id"]!.GetValue<Guid>();
        var c = (await Json(await Add(teacher, "CCCCC3")))["id"]!.GetValue<Guid>();

        Assert.Equal(HttpStatusCode.NoContent, (await teacher.DeleteAsync($"/api/teacher/reels/{b}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await teacher.DeleteAsync($"/api/teacher/reels/{b}")).StatusCode); // double tap is fine
        Assert.Equal(2, (await List(anonymous, "/api/public/reels")).Count);
        var row = await app.Db(db => db.InstagramReels.IgnoreQueryFilters().SingleAsync(r => r.Id == b));
        Assert.NotNull(row.DeletedAtUtc); // still in the database

        (await teacher.PostAsync($"/api/teacher/reels/{b}/restore", null)).EnsureSuccessStatusCode();
        var ids = (await List(anonymous, "/api/public/reels")).Select(x => x!["id"]!.GetValue<Guid>()).ToArray();
        Assert.Equal(new[] { a, b, c }, ids);
    }

    [Fact]
    public async Task Reorder_needs_the_full_current_list()
    {
        using var teacher = await app.Login();
        var a = (await Json(await Add(teacher, "AAAAA1")))["id"]!.GetValue<Guid>();
        var b = (await Json(await Add(teacher, "BBBBB2")))["id"]!.GetValue<Guid>();
        var c = (await Json(await Add(teacher, "CCCCC3")))["id"]!.GetValue<Guid>();

        (await teacher.PutAsJsonAsync("/api/teacher/reels/order", new { ids = new[] { c, a, b } })).EnsureSuccessStatusCode();
        Assert.Equal(new[] { c, a, b }, (await List(teacher)).Select(x => x!["id"]!.GetValue<Guid>()).ToArray());

        Assert.Equal(HttpStatusCode.Conflict, (await teacher.PutAsJsonAsync("/api/teacher/reels/order", new { ids = new[] { a, b } })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await teacher.PutAsJsonAsync("/api/teacher/reels/order", new { ids = new[] { a, a, b } })).StatusCode);
    }

    [Fact]
    public async Task Edit_keeps_the_thumbnail_unless_a_new_one_is_sent()
    {
        using var teacher = await app.Login();
        var reel = await Json(await Add(teacher, "AAAAA1"));
        var id = reel["id"]!.GetValue<Guid>(); var thumb = reel["thumbnailUrl"]!.GetValue<string>();

        var same = await Json(await Send(teacher, HttpMethod.Put, $"/api/teacher/reels/{id}", "https://www.instagram.com/reel/ZZZZZ9/", null));
        Assert.Equal(thumb, same["thumbnailUrl"]!.GetValue<string>());
        Assert.Equal("ZZZZZ9", same["shortcode"]!.GetValue<string>());

        var changed = await Json(await Send(teacher, HttpMethod.Put, $"/api/teacher/reels/{id}", "https://www.instagram.com/reel/ZZZZZ9/", Png(0xffb34a3c)));
        Assert.NotEqual(thumb, changed["thumbnailUrl"]!.GetValue<string>());
        using var anonymous = app.Anonymous();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(thumb)).StatusCode); // old file was cleaned up
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(changed["thumbnailUrl"]!.GetValue<string>())).StatusCode);
    }
}
