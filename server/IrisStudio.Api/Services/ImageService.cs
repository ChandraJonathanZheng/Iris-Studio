using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace IrisStudio.Api.Services;

/// <summary>Receipt images: check the real file type and make a tiny blurred preview (LQIP).</summary>
public class ImageService
{
    public const long MaxBytes = 5 * 1024 * 1024;

    /// <summary>Detects the format from the file's bytes (not the extension). Returns the MIME type or null.</summary>
    public static async Task<string?> DetectAsync(Stream s, CancellationToken ct)
    {
        s.Position = 0;
        try
        {
            var format = await Image.DetectFormatAsync(s, ct);
            s.Position = 0;
            return format switch
            {
                JpegFormat => "image/jpeg",
                PngFormat => "image/png",
                WebpFormat => "image/webp",
                _ => null,
            };
        }
        catch (UnknownImageFormatException) { return null; }
    }

    /// <summary>
    /// 課堂筆記 screenshots: re-encode whatever came in (JPG/PNG/WEBP) as WebP, at most <paramref name="maxSide"/> px on
    /// the long side. Decoding + re-encoding also drops EXIF (location, device) and anything hidden after the image data.
    /// Runs in memory, so the original upload is never written to disk.
    /// </summary>
    public static async Task<(byte[] Bytes, int Width, int Height)> ToWebpAsync(Stream s, CancellationToken ct, int maxSide = 2000, int quality = 80)
    {
        s.Position = 0;
        using var img = await Image.LoadAsync(s, ct);
        img.Mutate(x => x.AutoOrient());
        if (img.Width > maxSide || img.Height > maxSide)
            img.Mutate(x => x.Resize(new ResizeOptions { Size = new Size(maxSide, maxSide), Mode = ResizeMode.Max }));
        img.Metadata.ExifProfile = null;
        using var ms = new MemoryStream();
        await img.SaveAsWebpAsync(ms, new WebpEncoder { Quality = quality }, ct);
        s.Position = 0;
        return (ms.ToArray(), img.Width, img.Height);
    }

    /// <summary>
    /// 16 px wide JPEG as a data: URL (~300 bytes). The client shows it blurred while the full image loads (#8),
    /// so the box never sits empty or jumps when the picture arrives.
    /// </summary>
    public static async Task<string> MakeLqipAsync(Stream s, CancellationToken ct)
    {
        s.Position = 0;
        using var img = await Image.LoadAsync(s, ct);
        img.Mutate(x => x.Resize(new ResizeOptions { Size = new Size(16, 0), Mode = ResizeMode.Max }));
        using var ms = new MemoryStream();
        await img.SaveAsJpegAsync(ms, new JpegEncoder { Quality = 40 }, ct);
        s.Position = 0;
        return "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray());
    }
}
