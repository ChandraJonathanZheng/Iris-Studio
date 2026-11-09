using Microsoft.Extensions.Options;

namespace IrisStudio.Api.Services;

/// <summary>Private receipt files, with cleanup when the enclosing database transaction fails.</summary>
public sealed class ReceiptStorage(IWebHostEnvironment env, IOptions<StudioOptions> options, ILogger<ReceiptStorage> log)
{
    private readonly List<string> _uncommitted = [];
    private string Folder
    {
        get
        {
            var folder = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.ReceiptsFolder));
            var webRoot = Path.GetFullPath(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"));
            if (folder == webRoot || folder.StartsWith(webRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("ReceiptsFolder must be outside wwwroot.");
            return folder;
        }
    }

    public string PathFor(string name) => Path.Combine(Folder, Path.GetFileName(name));

    public async Task<string> SaveAsync(byte[] bytes, string type, CancellationToken ct)
    {
        Directory.CreateDirectory(Folder);
        var extension = type switch { "image/png" => ".png", "image/webp" => ".webp", _ => ".jpg" };
        var name = $"{Guid.NewGuid():N}{extension}";
        var path = PathFor(name);
        _uncommitted.Add(path);
        await File.WriteAllBytesAsync(path, bytes, ct);
        return name;
    }

    public void DeleteUncommitted()
    {
        foreach (var path in _uncommitted)
        {
            try { File.Delete(path); }
            catch (IOException ex) { log.LogWarning(ex, "Could not remove an uncommitted receipt."); }
        }
    }
}
