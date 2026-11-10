# Iris Studio backend

The .NET 10 API implements the launch backend in PRD, FEATURES, FLOW and SCHEMA. It serves the React production build from `wwwroot` on the same origin. UI text and business errors use Traditional Chinese; dates and lesson times use Asia/Taipei.

## Run locally

```powershell
# From Iris-Studio/
cd server
dotnet tool restore
dotnet run --project IrisStudio.Api
```

On Windows, Development connects to `.\MSSQLDEV2022` using Windows Authentication (`Integrated Security=True`), so the API runs as your current Windows account without a database username or password. That account needs permission to create the `iris_studio` database and apply migrations. SQL Server must already be running. The development connection encrypts traffic and trusts the local server certificate; production connections should validate their server certificate.

The app applies the selected provider's migrations before serving requests. SQL Server uses `SqlServerDbContext` and `Data/Migrations/SqlServer`; PostgreSQL uses `AppDbContext` and the existing `Data/Migrations`. Availability and the teacher are seeded once. Development settings also supply demo users; set `Studio__SeedDemo=false` to disable demo students. No demo users are seeded outside Development. Existing teacher passwords are never reset by seeding.

Existing `ConnectionStrings:Db` user secrets or `ConnectionStrings__Db` environment variables take precedence over the development file. Replace or remove an old PostgreSQL connection override when using SQL Server.

PostgreSQL, including Supabase, remains supported: set `Database__Provider=PostgreSql` and `ConnectionStrings__Db` to its Npgsql connection string. For Docker PostgreSQL, run `docker compose up -d` from the repository root and use `Host=localhost;Port=5432;Database=iris_studio;Username=iris;Password=iris`.

From `server/`, create and validate migrations for each provider when the model changes:

```powershell
dotnet ef migrations add <Name> --project IrisStudio.Api --context SqlServerDbContext --output-dir Data/Migrations/SqlServer -- --Database:Provider SqlServer
dotnet ef migrations add <Name> --project IrisStudio.Api --context AppDbContext --output-dir Data/Migrations -- --Database:Provider PostgreSql
```

To apply migrations separately, configure the connection, then run `dotnet ef database update --project IrisStudio.Api --context SqlServerDbContext -- --Database:Provider SqlServer` (or `AppDbContext` for PostgreSQL, with `-- --Database:Provider PostgreSql`). Each provider maintains its own migration history; switching providers does not copy existing data.

## Configuration

Production has no database connection or teacher password in `appsettings.json`. Supply environment variables or .NET user secrets. A new database requires a valid teacher email and a password of at least 12 characters, excluding the development default.

| Environment variable | Purpose |
|---|---|
| `Database__Provider` | `SqlServer` or `PostgreSql`; Development defaults to SQL Server, other environments to PostgreSQL |
| `ConnectionStrings__Db` | connection string for the selected database provider |
| `Studio__TeacherEmail`, `Studio__TeacherPassword`, `Studio__TeacherName` | initial teacher account |
| `Studio__Bank__Name`, `Studio__Bank__Account`, `Studio__Bank__Holder` | bank transfer information |
| `Studio__Packages__0__Price` (and subsequent indices) | package prices; 單堂課 defaults to NT$1,500 |
| `Studio__ReceiptsFolder` | persistent private receipt directory; must be outside `wwwroot` |
| `Line__ChannelId`, `Line__ChannelSecret` | LINE Login, callback `/api/auth/line/callback` |
| `Jwt__SigningKey` | required application JWT secret: a random value of at least 32 bytes, separate from the LINE Channel Secret |
| `Jwt__Issuer`, `Jwt__Audience`, `Jwt__LifetimeDays` | defaults: `iris-studio`, `iris-studio-web`, 30 days (allowed range 1–30) |
| `Line__MessagingAccessToken` | LINE Messaging push token |
| `Notifications__EmailProvider` | `Smtp` (configured for Gmail) or `Resend` |
| `Notifications__FromEmail` | sender address; configured as `lead938@gmail.com` |
| `Notifications__Smtp__Host`, `Notifications__Smtp__Port` | Gmail: `smtp.gmail.com`, port `587` with required STARTTLS; port `465` uses TLS on connection |
| `Notifications__Smtp__Username` | Gmail login; configured as `lead938@gmail.com` |
| `Notifications__Smtp__Password` | Gmail App Password, supplied through user-secrets or an environment variable |
| `Notifications__Smtp__FromName` | sender display name; defaults to `Iris Studio` |
| `Notifications__ResendApiKey` | required only when the email provider is `Resend` |
| `Notifications__Enabled` | `false`: in-app only; `true`: enable configured external channels |
| `Studio__RunBackgroundJobs` | defaults to `true`; disable only for isolated tests |

Set `Jwt:SigningKey` using .NET user-secrets in Development or `Jwt__SigningKey` in production. Never commit the signing key. Changing it invalidates existing tokens.

The backend issues its own HS256 application JWT after email registration/login and after the LINE callback commits the local user. The browser receives it as the `iris.auth` HttpOnly, SameSite=Lax cookie, scoped to `/` on the public login host. It expires after 30 days by default, without sliding renewal. Production requires Secure cookies; HTTPS requests also get Secure cookies in Development. Clients can alternatively send the token in an `Authorization: Bearer` header, which takes precedence over cookies. JavaScript does not store the token in localStorage or URLs.

Every authenticated request validates the JWT signature, issuer, audience, expiration, current database user and role. Pending accounts stay signed in but cannot use student dashboard APIs until approved. Logout deletes the browser cookie; a separately copied bearer token remains valid until expiry or database access is revoked. `/api/me` is never cached. Cross-origin writes are rejected; Development also accepts the Vite origin `http://localhost:5173`.

LINE Login uses discovery, authorization code + PKCE, state/nonce validation, and `bot_prompt=aggressive`. LINE web ID tokens use HS256 with the Channel Secret, independently of the ES256 JWKS advertised by discovery. These provider tokens are validated before creating a local user and are never used as Iris session tokens. Existing users are matched by the unique LINE subject; their studio profile, role and approval status are preserved. Successful callbacks issue the application JWT and redirect active students to `/app`, teachers to `/teacher`, and new pending users to `/pending`. Callback failures are logged and shown on the login screen.

Register the callback on the **public host where login starts**. For example, when Vite on port 5173 proxies `/api` to port 5080, the callback is `https://<frontend-tunnel>/api/auth/line/callback`. Start login through that same frontend host, and process trusted forwarded headers before authentication. A callback on another host loses the original state/nonce cookies. Link the Official Account to the Login channel under the same provider. External LINE login and delivery require verification with the real provider accounts; tests do not contact those accounts.

## Gmail SMTP setup

The email provider is configured for `lead938@gmail.com` at `smtp.gmail.com:587` with required STARTTLS. LINE-linked accounts still receive LINE messages; email-only accounts use SMTP. The Gmail password in `appsettings.json` is deliberately empty. Enter it using the masked PowerShell prompt, from the `Iris-Studio/` directory:

```powershell
.\scripts\configure-gmail.ps1
```

Use a **16-character Google App Password**, created for `lead938@gmail.com` after enabling 2-Step Verification: <https://myaccount.google.com/apppasswords>. See [Google's App Password instructions](https://support.google.com/accounts/answer/185833?hl=en). The script accepts the grouped password with spaces, saves it as `Notifications:Smtp:Password` in .NET user-secrets through stdin, and preserves existing unrelated secrets. It does not send a test email or change `Notifications:Enabled`.

Restart the API after entering the password. External delivery requires `Notifications:Enabled=true`; the existing app setting controls this. In production, supply `Notifications__Smtp__Password` through the deployment's secret configuration instead of running the development script.

SMTP uses a fresh authenticated TLS connection per email, a 15-second transport timeout, UTF-8 plain-text messages, and a stable `Message-ID` derived from the alert ID. Missing credentials, failed TLS, authentication errors and rejected delivery propagate to the outbox retry mechanism. SMTP has no provider idempotency guarantee, so an ambiguous network failure after message acceptance can result in duplicate delivery on retry.

## Email password recovery

The email login form links to `/forgot-password`, preserving the entered address. Returning from recovery opens email login directly. LINE-only users are directed back to LINE sign-in; a verified contact email alone does not enable email/password recovery. Accounts with both an existing email password and a LINE binding can recover their email password.

`POST /api/auth/forgot-password` accepts `{ email }` and returns the same empty `202 Accepted` for eligible, unknown, declined and LINE-only accounts. Invalid email syntax returns `400`. Eligible accounts get the existing `password-reset` email through the transactional email outbox. Requests are limited to three per IP per minute and one issued link per account every two minutes. A newly issued link invalidates older ones.

`POST /api/auth/reset-password/validate` accepts `{ token }`, checks the link without consuming it, and returns `204` or `400 invalid_token`. The reset page checks this before showing password fields and offers a retry for connection errors. `POST /api/auth/reset-password` accepts `{ token, password }`; it permits 8–128 characters and atomically consumes the token, updates the password, revokes other reset tokens and increments the user's session version. Existing cookies and bearer tokens are then rejected. Validation and reset share a separate limit of ten requests per IP per minute, independent of normal login.

Tokens use 32 cryptographically random bytes, expire after 60 minutes, and are stored hashed in `AuthTokens`. The email outbox temporarily holds the raw link until delivery; sensitive email payloads are cleared after delivery. Email links use the configured `Notifications:BaseUrl`, never the request Host header. Set this to the public **frontend** URL when using separate development tunnels. The frontend removes link tokens from the address bar, sends them in request bodies, and sets `no-referrer`. All recovery API responses disable caching. No schema change is needed beyond the existing EmailNotifications migrations.

The UI uses Traditional Chinese to match the app: inline validation, visible sending/updating states, a neutral delivery confirmation, a two-minute resend countdown, email correction, password confirmation, expired-link recovery, and an explicit return to email login after success. Resetting a password does not automatically sign the user in.

## Consultation confirmation emails

`POST /api/teacher/consults/{id}/schedule` saves the consultation in Taipei time and queues the existing `consult-scheduled` template for an applicant who left an email. Initial scheduling and changes to the date, time or trimmed note each send a new confirmation; an unchanged save sends nothing. The email includes the complete note, date, time and timezone. A direct HTTPS `meet.google.com` link in 備註 becomes the “加入 Google Meet” button, with a copyable link in both HTML and plain text. Without a Meet link, the existing studio button remains.

Iris can use “重寄確認信” (`POST /api/teacher/consults/{id}/confirmation`, `202 Accepted`) for an existing future appointment. Resends have a one-minute cooldown (`429`). LINE-only consultations do not have an email recipient and must be contacted through LINE. Only a teacher can schedule or resend.

Confirmation emails commit in the same transaction as the schedule. New confirmations supersede older queued/retrying confirmations, and delivery rechecks the current contact, slot and note before sending. This also handles returning to a previously chosen slot. Delivery uses the existing SMTP provider and retry mechanism; no schema migration is required.

## Transactions and consistency

For this one-teacher workload, authenticated write requests acquire one transaction-owned application lock before reading mutable state: `sp_getapplock` on SQL Server and `pg_advisory_xact_lock` on PostgreSQL. BookingService uses the same lock when invoked outside an endpoint. This serializes studio writes across app instances, preventing stale credit updates and conflicting decisions. It is intended for a small studio, not high-throughput multi-tenant workloads. Per-date booking locks and unique/check constraints are enforced on both providers.

Booking, refunds, payments and manual adjustments append credit audit records. Manual adjustment returns `{credits, id, undoUntil}`; `POST /api/teacher/credit-adjustments/{id}/undo` reverses that record once, within 30 seconds. The client and mock API use this contract.

Idempotency records commit with their mutation. Hashes include bound request values, teacher booking student ID, form fields and actual receipt bytes. Successful retries preserve status, JSON values and Location. Failed actions roll back their records and changes. Replay JSON is stored as `nvarchar(max)` on SQL Server and `jsonb` on PostgreSQL; JSONB may normalize JSON whitespace and object key order.

Receipts accept JPEG, PNG or WEBP by encoded content, at most 5 MB and 20 million decoded pixels. SkiaSharp validates the image and produces the JPEG preview. It replaces the original vulnerable ImageSharp 3.1 dependency; patched ImageSharp releases require a separate build license. Files are private to the owner and teacher and are removed if their database transaction fails. Back up receipts, database and `App_Data/keys` together. Process termination between file creation and commit may leave an unreferenced file; reconciliation of crash orphans is not scheduled.

## Background work

- `AlertDispatcher`: every 5 seconds, claims due outbox rows with `UPDLOCK, READPAST, READCOMMITTEDLOCK` on SQL Server or `FOR UPDATE SKIP LOCKED` on PostgreSQL, persists delivery per alert, and backs off failures without blocking other alerts. Provider requests use the alert ID as an idempotency/retry key. LINE-linked students use LINE; other students use email. Missing enabled-provider configuration leaves delivery queued for retry.
- `StudioMaintenance`: starts immediately and runs every minute. It marks ended Booked lessons Attended and closes their open change requests atomically. Once per day it removes idempotency records older than 24 hours. Delivery failures do not stop maintenance.
- Alerts become visible in-app after the configured 10-second delay. Undo removes unreleased alerts. The business undo window is 30 seconds; alerts already released or sent externally cannot be recalled. Manual reminders can be withdrawn only before release.

## Validation

Integration tests use a real database, including migrations, filtered indexes, transaction locks and concurrent HTTP requests. On Windows they default to `.\MSSQLDEV2022` with Windows Authentication. Override `IRIS_TEST_DB` to use another local administrative connection with CREATE DATABASE permission. Tests create a uniquely named database, operate only on that database, and drop it on disposal.

```powershell
cd server
dotnet test IrisStudio.slnx
dotnet build IrisStudio.slnx -c Release
dotnet ef migrations has-pending-model-changes --project IrisStudio.Api --context SqlServerDbContext -- --Database:Provider SqlServer
```

To run the same tests against local PostgreSQL, set `IRIS_TEST_PROVIDER=PostgreSql` and `IRIS_TEST_DB` to a PostgreSQL administrative connection before running `dotnet test`. Validate that model separately with `dotnet ef migrations has-pending-model-changes --project IrisStudio.Api --context AppDbContext -- --Database:Provider PostgreSql`.

Coverage includes registration/approval, JWT cookie and bearer sessions, rejected token signatures/issuers/audiences/expiration/roles, complete LINE HS256 callback processing with a stub backchannel, state/nonce rejection, repeat login without duplicate users, role and data isolation, concurrent booking and payment confirmation, last-credit protection, refund boundary, proposal consent, availability revalidation, audit-backed undo, receipt privacy/content hashing, automatic reminders, attendance, outbox retry isolation, LINE/Resend request contracts using an HTTP stub, and SMTP delivery against a local STARTTLS server. The SMTP tests check authentication, message content, missing credentials, TLS enforcement and authentication failure without contacting Gmail.

For the frontend build, run `npm run build` in `client/`. This runs the TypeScript check and builds the browser and SSR bundles. Backend tests do not use the MSW prototype.
