# Iris Studio

Website + booking system for Iris's one-teacher singing studio in Taiwan.
Students sign in with LINE, book / move / cancel lessons and track their sessions; Iris approves requests, confirms bank-transfer receipts and sees every lesson in one place. No payment gateway.

**Stack:** .NET 10 Minimal API · EF Core + SQL Server (local) / PostgreSQL · React 19 + Vite + TypeScript · TanStack Query · React Router 7

```
iris-studio/
├─ docker-compose.yml            optional local PostgreSQL
├─ client/                       React app
│  ├─ src/lib/                   api.ts, queries.ts (cache + optimistic updates), date.ts, prefetch.ts, types.ts
│  ├─ src/components/            Shell, Sheet (Vaul), CommandMenu (cmdk), SlotPicker, Toast (undo), ui
│  ├─ src/pages/                 Landing (pre-rendered), Auth, student.tsx, teacher.tsx
│  ├─ src/mocks/                 in-browser mock API (same rules as the server) for demos and tests
│  └─ e2e/smoke.mjs              Playwright checks for the interaction details
└─ server/IrisStudio.Api/
   ├─ Program.cs                 wiring: DB, JWT + LINE auth, rate limits, routes
   ├─ appsettings.json           studio rules: slots, prices, bank, undo window, alert delay
   ├─ Data/                      Entities, AppDbContext, Seed
   ├─ Services/                  BookingService (all lesson/quota rules), AlertService + outbox, StudioClock, ImageService
   ├─ Infrastructure/            IdempotencyFilter, problem responses, ActiveStudentFilter
   ├─ Contracts/                 DTOs = JSON shapes
   └─ Endpoints/                 Public/Auth, Slots/Student, Teacher
```

## Run it

### UI only, no backend (fastest)
```bash
cd client
npm install
npm run dev:mock          # http://localhost:5173 — pick a demo account on the login page
```
The mock API (`src/mocks`) runs in the browser and follows the same rules as the server (slots, 24 h refund, idempotency, undo windows, delayed alerts).

### Full stack
You need the **.NET 10 SDK**, **Node 20+** and **SQL Server 2022** running as `.\MSSQLDEV2022` on Windows. Development uses Windows Authentication with the account running the API and creates `iris_studio` on first startup.
```bash
cd server
dotnet tool restore                                   # from server/ (local EF tool manifest)
dotnet run --project IrisStudio.Api                     # http://localhost:5080 (applies committed migrations, seeds Iris + demo students)

cd ../client
npm install
npm run dev                                            # http://localhost:5173, /api is proxied to .NET
```
Logins (Development): Iris `iris@studio.local` / `change-me-now`; demo students `xiaoming@demo.local` (also jiaying, yating, jiahao, sihan) / `demo1234`.

`appsettings.Development.json` supplies `Database:Provider=SqlServer` and an integrated-security connection string. Existing `ConnectionStrings:Db` user secrets or environment variables override that connection; remove an old PostgreSQL override or replace it with the SQL Server connection. The local certificate is trusted only in Development. PostgreSQL/Supabase remains available with `Database__Provider=PostgreSql` and a matching `ConnectionStrings__Db`; see [backend setup](docs/BACKEND.md).

**Authentication:** configure a random `Jwt:SigningKey` of at least 32 bytes using .NET user-secrets (or `Jwt__SigningKey` in production). The backend issues an application JWT in an HttpOnly cookie; `/api/me` reads the current database user from that session.

**LINE Login:** create a LINE Login channel, set the callback URL to `https://<your-public-login-host>/api/auth/line/callback`, then
`dotnet user-secrets set --project server/IrisStudio.Api "Line:ChannelId" "…"` and `dotnet user-secrets set --project server/IrisStudio.Api "Line:ChannelSecret" "…"` (from the repository root). Without them the LINE button answers "not configured" and email login still works. See [Backend setup and validation](docs/BACKEND.md) for configuration, notification adapters and database integration tests.

With separate development tunnels, login through the frontend tunnel on port 5173 and register that host's callback; `/api` is proxied to the backend on port 5080. New LINE users are saved as Pending until approved; active accounts enter their dashboard after login.

### Production build
`cd client && npm run build` type-checks, builds into `server/IrisStudio.Api/wwwroot` and pre-renders the landing page. Then deploy the one .NET app (one domain, no CORS).

### Tests
```bash
cd client
npm run build:mock && npx vite preview --port 4173 --mode mock &
npx playwright install chromium   # once
node e2e/smoke.mjs                # 22 checks: idempotency, undo, rollback, back gestures, a11y (axe), safe areas…
```

## The 20 interaction details — where they live

| # | Detail | Where |
|---|---|---|
| 1 | Skeleton loaders | `components/ui.tsx` (`PageSkeleton`, `ListSkeleton`), shown only while `isPending` |
| 2 | Optimistic updates | `lib/queries.ts` — approve/decline, receipts, alerts, profile, credits (`onMutate` → rollback `onError`). **Booking and cancel wait for the server** (credits, race, 24 h clock) |
| 3 | ⌘K command menu | `components/CommandMenu.tsx` (cmdk): pages, actions, students from cache |
| 4 | Shortcut hints | sidebar search button + menu footer, `aria-keyshortcuts` |
| 5 | Undo instead of "are you sure" | `components/Toast.tsx` + `/undo` endpoints (30 s window) + **alerts delayed 10 s** in `AlertService`, so undo deletes them before the student sees them |
| 6 | Stale-while-revalidate | TanStack Query defaults (`staleTime 30 s`, refetch on focus); slots `staleTime 0` |
| 7 | Pre-rendering | `entry-server.tsx` + `scripts/prerender.mjs` (landing). Dashboards: code-split + prefetch on hover/touch (`lib/prefetch.ts`) |
| 8 | Blurred image placeholders | `ImageService.MakeLqipAsync` (SkiaSharp, 16 px JPEG at upload) → `BlurImage` |
| 9 | View transitions | `viewTransition` on links/navigation; CSS in `styles.css`; off with reduced motion |
| 10 | Swipe-to-dismiss sheets | `components/Sheet.tsx` (Vaul) |
| 11 | Interruptible animations | Vaul drag + CSS transitions only |
| 12 | Predictive back | every sheet is a route (`/app/book/confirm`, `/teacher/requests/:id/decline`…) |
| 13 | Tap targets > icon | 44 px minimum, `.hit` / `::after` hit areas |
| 14 | Safe-area insets | `viewport-fit=cover` + `env(safe-area-inset-*)`, `100dvh` |
| 15 | One-time code autofill | `autocomplete` on all fields; add `autocomplete="one-time-code"` if email/SMS codes are introduced |
| 16 | Tabular numbers | `body { font-variant-numeric: tabular-nums }` |
| 17 | Balanced headlines | `text-wrap: balance` / `pretty` |
| 18 | Continuous corners | `@supports (corner-shape: squircle)` |
| 19 | Idempotency keys | client sends `Idempotency-Key`; `Infrastructure/IdempotencyFilter.cs` stores it in the same transaction as the action |
| 20 | Safe triangle | not needed (no hover submenus); use Radix DropdownMenu if one is added |

## Key rules (and why)

| Rule | Why |
|---|---|
| Unique index on `(Date, Time) WHERE Status='Booked'` | Two students tapping the same slot at the same second: only one insert can win at the database. |
| `UPDATE … SET Credits = Credits - 1 WHERE Credits > 0` + `CHECK (Credits >= 0)` | Two devices booking at once can't both spend the last credit. |
| Idempotency key in the same transaction | One student's double tap or network retry books once and gets the same answer twice. |
| Undo = do it now, delay the alert | Iris works fast; the student never gets "approved → actually declined". |
| Student status checked from the DB on every call | Approval works instantly without logging in again. |
| `StudioClock` (Asia/Taipei) | Lessons are studio wall-clock times even if the server runs in UTC. |
| Receipts served only via `/api/receipts/{id}` | Transfer screenshots contain bank details: only the uploader and Iris. File type checked by bytes. |
| 精彩片段 Reels: max 8, soft delete, whole-list reorder (`/teacher/reels`, `ReelEndpoints.cs`) | Soft delete makes 復原 a simple restore; a global query filter means no query forgets to hide deleted rows; reorder sends every id so a stale list gets 409 instead of a half-saved order. **Needs migration `InstagramReels`** (both providers, see `docs/BACKEND.md`). |

## Before going live
- [ ] Real content on the landing page (photos, bio, **real, consented** testimonials), real bank details and prices
- [ ] Strong teacher password via environment variable / user-secrets
- [ ] HTTPS (the auth cookie is `Secure` outside Development)
- [ ] LINE Login channel + callback URL; LINE Messaging and Gmail SMTP credentials, then `Notifications:Enabled=true` for external notifications
- [ ] Backups for the database, `App_Data/receipts` and `App_Data/reels`


## Clickable demo

`docs/demo/iris-studio-demo.html` — single-file build of the prototype (mock API, demo accounts), 12 Nov 2026. Open it directly in a browser. Bank details in it are placeholders.
