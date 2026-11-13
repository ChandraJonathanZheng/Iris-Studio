# Instagram Reels — Rencana Fitur

Versi 13 Nov 2026 · Status: ⬜ planned

Website publik menampilkan list IG Reels (maksimal 8), diambil dari backend.

---

## 1. Backend — Migration baru `InstagramReels`

### Entity (`server/IrisStudio.Api/Data/Entities.cs`)

| Kolom | Tipe | Catatan |
|---|---|---|
| `Id` | int | Primary key |
| `Sort` | int | Urutan tampil (1–8), di-index karena query selalu `ORDER BY Sort` |
| `Title` | string (200) | Wajib |
| `Url` | string (500) | Link IG Reel, wajib |
| `Thumbnail` | string (500) | URL gambar thumbnail, wajib |
| `IsActive` | bool | Default `true`, supaya reel bisa disembunyikan tanpa dihapus |
| `CreatedAt` | DateTime (UTC) | |

- Tambah `DbSet<InstagramReel> InstagramReels` di `AppDbContext.cs`.
- Generate migration:
  ```bash
  cd server/IrisStudio.Api
  dotnet ef migrations add AddInstagramReels
  ```
- Migration jalan otomatis waktu app start (`Seed.cs` → `db.Database.MigrateAsync()`).
- ⚠️ Folder `Migrations/` belum ada di repo. Kalau ini migration pertama, file-nya juga akan berisi semua tabel yang sudah ada (bukan cuma `InstagramReels`). Cek dulu sebelum commit.
- Opsional: tambah 8 data dummy di `Seed.cs` (mode demo) supaya frontend bisa langsung dites.

## 2. Backend — API

**`GET /api/reels`** · publik (tanpa login)

Response:

```json
{
  "code": 200,
  "message": "okay",
  "data": [
    { "sort": 1, "title": "abc", "url": "https://www.instagram.com/reel/...", "thumbnail": "https://url.com/thumb.jpg" }
  ]
}
```

Aturan:
- Hanya `IsActive = true`, urut `Sort` naik, maksimal 8 (`Take(8)` di SQL, bukan di memory).
- `AsNoTracking()` karena read-only.
- Kalau belum ada data, kirim `data: []` (bukan 404), jadi frontend cukup tampilkan state kosong.
- Pakai DTO `ReelDto(Sort, Title, Url, Thumbnail)` di `Contracts/Dtos.cs`, supaya `Id` / `IsActive` / `CreatedAt` tidak ikut ke publik.

Lokasi kode: repo ini pakai **Minimal API** (`Endpoints/*.cs`), bukan Controller. Daftarkan endpoint di file `Endpoints/` (misalnya `PublicAuthEndpoints.cs` atau file baru `ReelsEndpoints.cs` + `app.MapReels()` di `Program.cs`).

> **Perlu diputuskan:** endpoint lain di repo ini mengembalikan data langsung, dan error pakai RFC 7807 (`Problems.Of`). Format `{code, message, data}` ini akan jadi satu-satunya yang berbeda. Pilihannya: tetap pakai wrapper (sesuai spec), atau ikut konvensi repo (`/api/public/reels` dan return array langsung).

## 3. Frontend — Proxy & pemakaian

- **Dev:** `client/vite.config.ts` sudah mem-proxy semua `/api` → `http://localhost:5080`, jadi `/api/reels` otomatis ikut. Tidak perlu ubah config.
- **Production:** .NET menyajikan build React dari `wwwroot` (satu domain), jadi `/api/reels` langsung kena backend. Tidak perlu proxy tambahan.
- **Mock mode (`npm run dev:mock`):** tambah handler `GET /api/reels` di `client/src/mocks/handlers.ts` + data 8 reel di `mocks/db.ts`, supaya UI tetap jalan tanpa .NET.
- Tambah fungsi di `client/src/lib/api.ts` / `queries.ts`:
  ```ts
  type Reel = { sort: number; title: string; url: string; thumbnail: string };
  // fetch('/api/reels') → json.data
  ```
- UI: section IG Reels di website publik (thumbnail + title, klik buka link IG di tab baru).

## 4. Checklist

- [ ] Entity `InstagramReel` + `DbSet` + konfigurasi kolom
- [ ] Migration `AddInstagramReels`
- [ ] Seed 8 data dummy (demo)
- [ ] DTO `ReelDto`
- [ ] Endpoint `GET /api/reels`
- [ ] Putuskan format response (wrapper vs konvensi repo)
- [ ] Mock handler + mock data
- [ ] API client + query hook di frontend
- [ ] Section IG Reels di website publik
- [ ] Tambah baris di `FEATURES.md`
