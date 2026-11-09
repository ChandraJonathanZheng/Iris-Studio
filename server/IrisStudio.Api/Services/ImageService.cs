using SkiaSharp;

namespace IrisStudio.Api.Services;

/// <summary>Receipts are checked by encoded content, bounded in decoded size, and given a 16px preview.</summary>
public static class ImageService
{
    public const long MaxBytes = 5 * 1024 * 1024;
    private const long MaxPixels = 20_000_000;

    public static Task<string?> DetectAsync(Stream stream, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        stream.Position = 0;
        using var managed = new SKManagedStream(stream, false);
        using var codec = SKCodec.Create(managed);
        var type = codec?.EncodedFormat switch
        {
            SKEncodedImageFormat.Jpeg => "image/jpeg",
            SKEncodedImageFormat.Png => "image/png",
            SKEncodedImageFormat.Webp => "image/webp",
            _ => null,
        };
        stream.Position = 0;
        return Task.FromResult(type);
    }

    public static Task<string> MakeLqipAsync(Stream stream, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        stream.Position = 0;
        using var managed = new SKManagedStream(stream, false);
        using var codec = SKCodec.Create(managed);
        if (codec is null || codec.Info.Width <= 0 || codec.Info.Height <= 0 || (long)codec.Info.Width * codec.Info.Height > MaxPixels)
            throw new BizException(400, "bad_image", "圖片損壞或尺寸過大，請縮小後再上傳。");
        using var bitmap = new SKBitmap(codec.Info);
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success)
            throw new BizException(400, "bad_image", "圖片損壞或格式不正確。");
        var scale = Math.Min(1d, 16d / Math.Max(bitmap.Width, bitmap.Height));
        var width = Math.Max(1, (int)Math.Round(bitmap.Width * scale));
        var height = Math.Max(1, (int)Math.Round(bitmap.Height * scale));
        using var preview = bitmap.Resize(new SKImageInfo(width, height), new SKSamplingOptions(SKFilterMode.Linear));
        using var encoded = preview.Encode(SKEncodedImageFormat.Jpeg, 40);
        stream.Position = 0;
        return Task.FromResult("data:image/jpeg;base64," + Convert.ToBase64String(encoded.ToArray()));
    }
}
