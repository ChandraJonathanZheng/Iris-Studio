# Iris Studio — Database Schema

PostgreSQL · EF Core 10 (code-first) · source of truth: `server/IrisStudio.Api/Data/Entities.cs` + `AppDbContext.cs`.
Version **13 Nov 2026 v2.4** (adds `PricePackages`, `InstagramReels`, `StudentNotes`, `Users.ConsultationCompleted/StudentNo/Gender/JoinedOn/DisabledAtUtc`, AlertKind `Homework` — §11). 12 Nov 2026 v2.3 (adds `PasswordResetTokens` + `PasswordHistories` — §10; and `LessonReports` + `CancellationFees` for 回報, `Lessons.CancelledByReport`, AlertKind `Report` — §9). v2.1 8 Nov (adds availability tables, consult contact type / time window, payment reminders; then `ChangeRequests.ProposedBy`, `Payments.IsTrial`, AlertKind `Proposal`).

**Conventions**
- Primary keys are `uuid` (generated in .NET) except the three availability tables (natural keys).
- Every enum is stored as **text** (`"Booked"`, not `0`), max 16 chars — readable in SQL, safe to extend.
- Times: `date` + `time` columns are **studio local time** (Asia/Taipei). `…Utc` columns are `timestamp` in UTC.
- No soft delete for lessons: they are cancelled (status), never deleted; history stays. Exception: `InstagramReels` (soft delete). Students are 停用 (`DisabledAtUtc`), not deleted.
- First migration not created yet: `dotnet ef migrations add Initial && dotnet ef database update`.

---

## 1. ER diagram

```mermaid
erDiagram
  USERS ||--o{ LESSONS : "books"
  USERS ||--o{ PAYMENTS : "uploads"
  USERS ||--o{ ALERTS : "receives"
  USERS ||--o{ CREDIT_LOGS : "credit history"
  LESSONS ||--o{ CHANGE_REQUESTS : "move requests"
  LESSONS ||--o{ LESSON_REPORTS : "回報"
  LESSON_REPORTS ||--o| CANCELLATION_FEES : "取消費"
  PAYMENTS ||--o{ CANCELLATION_FEES : "billed on"
  USERS ||--o{ IDEMPOTENCY_RECORDS : "retries"
  BOOKING_SETTINGS ||--|| WEEKLY_AVAILABILITY : "generates slots with"
  WEEKLY_AVAILABILITY }o--o{ DATE_OVERRIDES : "overridden by"

  USERS { uuid Id PK  text Role  text Status  text Email UK  text LineUserId UK  int Credits  text ClassType }
  LESSONS { uuid Id PK  uuid StudentId FK  date Date  time Time  text Status  text Type  int DurationMinutes }
  CHANGE_REQUESTS { uuid Id PK  uuid LessonId FK  date ToDate  time ToTime  text ProposedBy  text Status }
  PAYMENTS { uuid Id PK  uuid StudentId FK  int PackageSize  int Amount  bool IsTrial  text Status  text ReceiptPath }
  LESSON_REPORTS { uuid Id PK  uuid LessonId FK  uuid StudentId FK  text Status  bool FeeWaived }
  CANCELLATION_FEES { uuid Id PK  uuid ReportId FK  uuid LessonId FK  int Amount  text Status  uuid PaymentId FK }
  ALERTS { uuid Id PK  uuid UserId  text Kind  timestamp SendAfterUtc  text Source }
  CONSULTS { uuid Id PK  text ContactType  text Contact  text PreferredTime }
  CREDIT_LOGS { uuid Id PK  uuid StudentId  int Delta  text Reason }
  IDEMPOTENCY_RECORDS { uuid Key PK  uuid UserId  text Endpoint }
  BOOKING_SETTINGS { int Id PK  int LessonMinutes  int GapMinutes  int AdvanceDays }
  WEEKLY_AVAILABILITY { int Weekday PK  bool Enabled  text Ranges }
  DATE_OVERRIDES { date Date PK  bool Closed  text Ranges  text Note }
```

---

## 2. Enums

| Enum | Values | Meaning |
|---|---|---|
| `Role` | Student, Teacher | one Teacher (Iris) |
| `UserStatus` | Pending, Active | Pending = waiting for Iris |
| `LessonStatus` | Booked, Attended, Cancelled | |
| `LessonType` | Private, Group, Trial | 一對一 / 團體課 / 體驗課 — one label set for lessons **and** the student's class type; the class type is copied to the lesson at booking |
| `ChangeStatus` | Open, Approved, Declined, Withdrawn | |
| `ChangeBy` | Student, Teacher | who asked: Student = 學生申請 (Iris decides), Teacher = 老師提議 (the student decides) |
| `PaymentStatus` | Pending, Confirmed, Rejected | |
| `ReportStatus` | Open, Approved, Declined, Withdrawn | 回報 of a past lesson; Declined is final, Withdrawn lets the student report again |
| `FeeStatus` | Unpaid, Billed, Paid | 取消費: Billed = added to the student's next receipt |
| `AlertKind` | Moved, Approved, Declined, Payment, Added, Welcome, Cancelled, Reminder, Proposal, Report, **Homework** | Homework = 老師給你新的作業 (13 Nov) · Report = 回報 decided ·  Reminder = 通知學生繳學費 (manual or automatic) · Proposal = 老師想調整上課時間 |

---

## 3. Tables

### `Users`
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| Name | varchar(80) | | |
| Role | text(16) | | Student / Teacher |
| Status | text(16) | | Pending → Active on approval |
| Email | varchar(200) | ✓ | **unique** where not null; lower-cased |
| PasswordHash | text | ✓ | PBKDF2; null for LINE-only accounts |
| Phone | text | ✓ | |
| LineUserId | text | ✓ | **unique** where not null; LINE Login `sub`, also the LINE push target |
| LineId | text | ✓ | LINE ID the student types (for Iris to search / contact) |
| VoiceType, Goal, Grade, AvatarUrl | text | ✓ | profile; Grade set by Iris |
| Credits | int | | lesson credits not yet booked — **check `Credits >= 0`** |
| PackageSize | int | | size of the last package (for the quota boxes) |
| ClassType | text(16) | | Private / Group / Trial — new sign-ups = Trial |
| Declined | bool | | application declined |
| ConsultationCompleted | bool | | Iris ticked 已完成諮詢／面談 → may buy one 單堂課 |
| CreatedAtUtc | timestamp | | |
| DecidedAtUtc | timestamp | ✓ | approval/decline time (undo window) |
| StudentNo | int | ✓ | 學號 shown as ID in 學生列表; **unique** where not null; max + 1 (from 1001) on approval |
| Gender | text(8) | ✓ | Male / Female |
| JoinedOn | date | ✓ | start of lessons (上課資年); set on approval, editable |
| DisabledAtUtc | timestamp | ✓ | 停用 time; null = active. Disabled students can't book |
| Skills | text[] | | 技能徽章 (≤ 12, each ≤ 20) — 課程 page |
| GrowthLevel | int | | 成長等級, **check 0–10**, teacher-only |

### `Lessons`
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| StudentId | uuid | | FK → Users (restrict delete) |
| Date | date | | studio local |
| Time | time | | studio local start |
| Status | text(16) | | Booked / Attended / Cancelled — Booked → Attended automatically once Date + Time + DurationMinutes has passed (`AttendanceSettler`) |
| Type | text(16) | | Private / Group / Trial |
| DurationMinutes | int | | copied from `BookingSettings.LessonMinutes` at booking time |
| CancelledAtUtc | timestamp | ✓ | |
| Refunded | bool | | credit returned on cancel |
| CancelledByTeacher | bool | | |
| CancelledByReport | bool | | cancelled afterwards because Iris approved a 回報 (Status Attended → Cancelled, Refunded = true) |
| CreatedAtUtc | timestamp | | |

Indexes: **`UX_Lesson_Slot_Booked` unique (Date, Time) where Status = 'Booked'** (same-start double booking) · (StudentId, Date).
Overlapping starts (after Iris changes length/break) are blocked in code by `IsTakenAsync` under a per-date `pg_advisory_xact_lock`.

### `ChangeRequests` (改時間)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| LessonId | uuid | | FK → Lessons (cascade) |
| ToDate / ToTime | date / time | | requested slot |
| Reason | varchar(300) | | student's reason, or Iris's message when she proposes; shown in 「」 |
| ProposedBy | text(16) | | Student (default) / Teacher. A Teacher proposal only moves the lesson when the student accepts. |
| Status | text(16) | | Open / Approved / Declined / Withdrawn |
| PrevDate / PrevTime | date / time | ✓ | old slot, kept so an approval can be undone |
| CreatedAtUtc / DecidedAtUtc | timestamp | / ✓ | |

Index: **unique (LessonId) where Status = 'Open'** — one open request per lesson, from either side (Iris's proposal declines a student's open request first).
Rule in code: a student request needs ≥ `Studio:MoveHours` (12) before the lesson.

### `Payments` (收據)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| StudentId | uuid | | FK → Users (restrict) |
| PackageSize | int | | 1 (體驗課) / 4 / 8 |
| IsTrial | bool | | the one-time 體驗課 package; allowed once per 體驗 student (Rejected doesn't count) |
| Amount | int | | NT$ |
| Status | text(16) | | Pending / Confirmed / Rejected |
| ReceiptPath | text | | file under `Studio:ReceiptsFolder` (served only via `/api/receipts/{id}` to owner + teacher) |
| ContentType | text | | image/jpeg · png · webp (checked by file signature) |
| Lqip | text | ✓ | ~300-byte blurred data-URL preview |
| Note | text | ✓ | student note (e.g. 末五碼) |
| RejectReason | text | ✓ | required when rejected |
| UploadedAtUtc / DecidedAtUtc | timestamp | / ✓ | |

Index: (Status, UploadedAtUtc). Rule in code: at most one Pending receipt per student; buying is otherwise allowed any time and credits never expire.

### `Alerts` (通知 + outbox)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| UserId | uuid | | recipient |
| Kind | text(16) | | AlertKind |
| Title / Body | text | | Body of a Reminder = Iris's edited message |
| Read | bool | | |
| CreatedAtUtc | timestamp | | |
| SendAfterUtc | timestamp | | now + 10 s for decisions → undo can delete it first |
| DeliveredAtUtc | timestamp | ✓ | set by `AlertDispatcher` after LINE / email push |
| Source | text | ✓ | `change:{id}`, `cancel:{id}`, `remind:{id}` … used by undo |

Indexes: (UserId, CreatedAtUtc) · (DeliveredAtUtc, SendAfterUtc) · (Source).

### `Consults` (免費諮詢)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| Name | varchar(80) | | |
| ContactType | varchar(10) | | `line` / `email` |
| Contact | varchar(120) | | LINE ID or email (email validated) |
| PreferredTime | varchar(20) | | `weekdayDay` / `weekdayEvening` / `weekend` / `any` |
| Topic | varchar(1000) | | optional |
| Contacted | bool | | |
| CreatedAtUtc | timestamp | | |

### `CreditLogs` (audit)
| Column | Type | Notes |
|---|---|---|
| Id | uuid | PK |
| StudentId | uuid | indexed |
| Delta | int | +/− |
| Reason | text | `payment:{id}`, `undo-payment:{id}`, `manual`, `manual: 補課：…` |
| ByUserId | uuid? | who did it |
| CreatedAtUtc | timestamp | |

### `IdempotencyRecords`
| Column | Type | Notes |
|---|---|---|
| Key | uuid | PK — the client's `Idempotency-Key` |
| UserId | uuid | |
| Endpoint | text | |
| RequestHash | text | same key + different body → 422 |
| StatusCode / ResponseJson | int? / jsonb? | replayed on retry |
| CreatedAtUtc | timestamp | indexed (for cleanup) |

Written in the **same transaction** as the action it protects.

### `BookingSettings` (預約設定) — single row, Id = 1
| Column | Type | Default | Allowed |
|---|---|---|---|
| Id | int | 1 | PK, not generated |
| LessonMinutes | int | 60 | 30, 45, 60, 90, 120 |
| GapMinutes | int | 30 | 0, 10, 15, 30, 60 |
| AdvanceDays | int | 30 | 7, 14, 30, 60, 90 |

### `WeeklyAvailability` (每週時段) — 7 rows
| Column | Type | Notes |
|---|---|---|
| Weekday | int | PK, 0 = Sunday … 6 = Saturday |
| Enabled | bool | OFF keeps its ranges, so switching back on restores them |
| Ranges | varchar(200) | `"09:30-12:30;14:00-20:30"` — sorted, no overlap, each ≥ lesson length |

### `DateOverrides` (特殊日期)
| Column | Type | Notes |
|---|---|---|
| Date | date | PK, today or later |
| Closed | bool | true = 全天休息 |
| Ranges | varchar(200) | own hours when not closed |
| Note | varchar(60) | e.g. 參加音樂會 |

Ranges are plain text on purpose (simple to read in SQL, no JSON mapping); `AvailabilityService.ParseRanges / FormatRanges` convert them.

---

## 4. Derived data (not stored)

| Value | How |
|---|---|
| Bookable slots for a date | override (closed / ranges) or weekly ranges → starts every `LessonMinutes + GapMinutes` while `start + LessonMinutes ≤ end` |
| Slot state | `past` if started · `full` if it overlaps a booked lesson (break included) · else `free` |
| Day state | `past` · `later` (beyond AdvanceDays) · `closed` (no ranges) · `full` · `open` |
| Booked count | Lessons with Status = Booked and in the future |
| Payment pending | any Payment with Status = Pending |
| Last reminded | max(Alerts.CreatedAtUtc) where Kind = Reminder |
| Remind channel | `line` if LineUserId, else `email` if Email, else none |
| Trial available | ClassType = Trial and no Payment with IsTrial and Status ≠ Rejected |

## 5. Seed (first start)
Teacher account from `Studio:TeacherEmail / TeacherPassword` · BookingSettings defaults · WeeklyAvailability Mon–Sat `09:30-12:30;14:00-20:30`, Sunday off · demo students + lessons only when demo seeding is on.

## 6. Useful queries

```sql
-- Today's lessons (pass the studio date from the app; CURRENT_DATE uses the DB time zone)
SELECT u."Name", l."Time", l."Type" FROM "Lessons" l JOIN "Users" u ON u."Id" = l."StudentId"
WHERE l."Date" = @today AND l."Status" = 'Booked' ORDER BY l."Time";

-- Students who need a 繳費提醒: no credits, nothing booked, no receipt waiting
SELECT u."Name" FROM "Users" u
WHERE u."Role" = 'Student' AND u."Status" = 'Active' AND u."Credits" = 0
  AND NOT EXISTS (SELECT 1 FROM "Lessons" l WHERE l."StudentId" = u."Id" AND l."Status" = 'Booked' AND l."Date" >= @today)
  AND NOT EXISTS (SELECT 1 FROM "Payments" p WHERE p."StudentId" = u."Id" AND p."Status" = 'Pending');

-- Money confirmed this month
SELECT COALESCE(SUM("Amount"), 0) FROM "Payments"
WHERE "Status" = 'Confirmed' AND "DecidedAtUtc" >= date_trunc('month', now() AT TIME ZONE 'UTC');

-- Why does a student have N credits? (audit)
SELECT "CreatedAtUtc", "Delta", "Reason" FROM "CreditLogs" WHERE "StudentId" = @id ORDER BY "CreatedAtUtc";
```

## 7. Known gaps / next migrations

| Item | Note |
|---|---|
| No FK on `Alerts.UserId`, `CreditLogs.StudentId` | add FKs to `Users` |
| Receipts on local disk | back up `App_Data/receipts` with the DB, or move to object storage |
| `IdempotencyRecords` cleanup | daily job, delete > 24 h |
| Group classes with capacity | **pending decision** — would replace `UX_Lesson_Slot_Booked` with a per-slot capacity |
| Re-apply after decline | **pending decision** — today `Users.Declined` blocks it |
| New columns since the first draft | `ChangeRequests.ProposedBy`, `Payments.IsTrial` — included in the Initial migration (none exists yet) |
| Phase 2 | `HomeworkSubmissions` (student hands in 作業), `Events`, `EventInvites` |

## 8. Added 8 Nov (later): teacher profile, consents, privacy requests

| Table / column | Notes |
|---|---|
| `Users.EmailVerified`, `LineIdPublic`, `TeacherStatus` (Normal/Vacation/NoNewStudents/Custom), `StatusLabel` (12), `StatusMessage` (60) | teacher profile; `LineId` max 30 |
| `ConsentRecords` (Id, UserId FK restrict, Kind Terms/Privacy/Media/Marketing/Guardian, Granted, Version 40, Scope 100, Source Register/Profile/Request, GuardianName/Relation/Contact, CreatedAtUtc) | **append-only** consent log; index (UserId, Kind, CreatedAtUtc) |
| `PrivacyRequests` (Id, Name 80, Contact 120, Type Access/Copy/Correct/Stop/Delete/Withdraw, Detail 1000, Done, Note 500, CreatedAtUtc, HandledAtUtc) | 個資法 §13: due = created + 15 d (Access/Copy) or 30 d |
| Enum conversions added | `ChangeBy`, `TeacherStatus`, `ConsentKind`, `ConsentSource`, `PrivacyRequestType` stored as text |

Retention job (`RetentionService`, every 6 h, `Studio:Retention`): idempotency 24 h · consults 12 mo · read alerts 12 mo · handled privacy requests 3 y. See `LEGAL.md`.

## 9. Added 12 Nov: 回報 (report a past lesson) and 取消費

Attendance is automatic, so a lesson the student missed still used a credit. 回報 lets the student ask Iris to cancel it afterwards.

### `LessonReports` (回報)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| LessonId | uuid | | FK → Lessons (restrict) — **unique where Status ≠ 'Withdrawn'** (`UX_LessonReport_Lesson`): one report per lesson |
| StudentId | uuid | | FK → Users (restrict) |
| Reason | varchar(200) | ✓ | student's optional reason |
| Status | text(16) | | Open / Approved / Declined / Withdrawn |
| TeacherMessage | varchar(300) | ✓ | required when Iris declines (the student sees it) |
| FeeWaived | bool | | Iris ticked 免收取消費 when approving |
| CreatedAtUtc / DecidedAtUtc | timestamp | / ✓ | DecidedAtUtc = undo window |

Index: (Status, CreatedAtUtc). Rules in code (`BookingService.ReportAsync`): lesson must be Attended and within `Studio:ReportDays` (7) days after it ended.

### `CancellationFees` (取消費)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| StudentId | uuid | | FK → Users (restrict) |
| LessonId | uuid | | FK → Lessons (restrict) |
| ReportId | uuid | | FK → LessonReports, **unique** (one fee per approved report) |
| Amount | int | | NT$ (`Studio:CancelFee`, 500) — check `Amount > 0` |
| Status | text(16) | | Unpaid → Billed → Paid |
| PaymentId | uuid | ✓ | FK → Payments (set null): the receipt it is billed on |
| LastPaymentId | uuid | ✓ | last receipt it was on, so 復原 of a rejected receipt can put it back |
| CreatedAtUtc | timestamp | | |

Index: (StudentId, Status). Flow: approve → Unpaid · student uploads a receipt → every Unpaid fee becomes Billed on it and `Payments.Amount` = package price + fees · receipt confirmed → Paid · rejected → Unpaid again (next receipt). `CreditLogs` gets `report:{id}` (+1) and `undo-report:{id}` (−1).

Migration: `dotnet ef migrations add LessonReports` (or include it in `Initial` if that hasn't been created yet).

## 10. Added 12 Nov: 忘記密碼

### `PasswordResetTokens`
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| UserId | uuid | | FK → Users (cascade) |
| TokenHash | varchar(64) | | SHA-256 (hex) of the token in the email — **unique**. The token itself is never stored |
| ExpiresAtUtc | timestamp | | created + `Studio:ResetLinkMinutes` (30) |
| UsedAtUtc | timestamp | ✓ | set when used, or when a newer link is requested |
| CreatedAtUtc | timestamp | | 1 link / minute / account |

Index: (UserId, CreatedAtUtc). `RetentionService` deletes rows 1 day after they expire.

### `PasswordHistories`
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| UserId | uuid | | FK → Users (cascade) |
| PasswordHash | text | | same PBKDF2 format as `Users.PasswordHash` |
| CreatedAtUtc | timestamp | | |

Holds the newest 3 passwords (current included), written by `PasswordService.SetPasswordAsync` at sign-up and on every reset. A new password that matches any of them → 409 `password_reused`.

Migration: `dotnet ef migrations add PasswordReset` (or part of `Initial`).

## 11. Added 12–13 Nov: 課程方案, IG Reels, student list, notes

### `PricePackages` (課程方案)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | int | | PK (identity) |
| Size | int | | lessons in the package — **unique** |
| Price | int | | NT$ |
| IsTrial | bool | | the 單堂課 row — at most one (**unique** filtered `"IsTrial"`) |
| SortOrder | int | | display order |

Seeded from `Studio:Packages` the first time; Iris edits them (`PUT /api/teacher/packages`). Receipts keep the amount they were uploaded with.

### `InstagramReels` (精彩片段)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| SortOrder | int | | 1…8, renumbered after delete / reorder — index |
| Title | varchar(60) | | IG 自訂標題 |
| Url | varchar(300) | | `https://www.instagram.com/reel/{code}/` (checked by regex) |
| CoverPath | text | ✓ | uploaded cover (9:16, recommended 1080 × 1920) in `Studio:ReelCoversFolder` |
| CoverLqip | text | ✓ | tiny blurred preview |
| CreatedAt | timestamp | | |
| DeletedAt | timestamp | ✓ | **soft delete** — global query filter `DeletedAt IS NULL` |

### `StudentNotes` (給筆記 / 給作業)
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| StudentId | uuid | | FK → Users |
| Kind | text(10) | | Note (only Iris sees it) / Homework (student is alerted) |
| Text | varchar(1000) | | **check** `char_length("Text") BETWEEN 1 AND 1000` |
| ByUserId | uuid | | who wrote it (Iris) |
| CreatedAtUtc | timestamp | | index (StudentId, CreatedAtUtc) |

### `LessonNotes` (課堂筆記, 14 Nov)
One per lesson. Rich text **or** one screenshot.
| Column | Type | Null | Notes |
|---|---|---|---|
| Id | uuid | | PK |
| LessonId | uuid | | FK → Lessons (cascade) · **unique** — saving again replaces the note |
| StudentId | uuid | | copied from the lesson · index — binds the note (and its file) to the student |
| Kind | text(10) | | Text / Image |
| Html | varchar(5000) | ✓ | Kind = Text: sanitised HTML (b, i, u, ul, ol, li, p, br, div — no attributes) |
| FileName | varchar(200) | ✓ | Kind = Image: the file id, `yyyyMMdd_學生姓名_Class_Notes.webp` (`…_HHmm.webp` for a 2nd lesson that day) in `Studio:LessonNotesFolder` |
| Lqip, Width, Height | text / int | ✓ | blurred preview + size of the WebP |
| ByUserId | uuid | | Iris |
| UpdatedAtUtc | timestamp | | |

**check** `CK_LessonNotes_Payload`: Text ⇒ Html set and FileName null; Image ⇒ FileName set and Html null.
Uploads are converted to WebP in memory (≤ 2000 px, EXIF removed); the original is never written to disk, and the old file is deleted once a replacement is saved.

### Derived for the 學生列表 / 個人資料 (not stored)
| Value | Rule |
|---|---|
| `segment` | `StudentSegments.Classify`: active (credits > 0) → noTrial (no confirmed payment ever) → lapsed (credits 0, last lesson < 91 days or a lesson still booked) → cold (credits 0, no purchase and no lesson > 91 days). Pending / declined / disabled = null |
| 最初上課 | earliest non-cancelled lesson date (or `JoinedOn` if earlier) |
| 首次購買課程 / 購買總額 | first / sum of **Confirmed** payments |
| 登入方式 | `LineUserId` set → LINE, else EMAIL |

Migration: none exists yet — all of this goes into the `Initial` migration (`dotnet ef migrations add Initial`).
