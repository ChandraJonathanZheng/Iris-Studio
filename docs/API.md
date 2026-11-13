# Iris Studio — HTTP API

ASP.NET Core 10 Minimal API · source of truth: `server/IrisStudio.Api/Endpoints/*.cs` + `Contracts/Dtos.cs`.
The client mock (`client/src/mocks/handlers.ts`, MSW) implements the same routes and rules for the prototype.
Version **13 Nov 2026 v1.0** (first written spec; adds the 學生列表 / 個人資料 / 筆記 endpoints of 13 Nov — §4).

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | same origin as the web app, everything under `/api` |
| Auth | HttpOnly, SameSite cookie (30 days sliding) from `/api/auth/*` or LINE Login. Policies: **Teacher**, **Student**; student routes also need an **Active** (approved, not declined) account → else `403 pending` |
| JSON | camelCase, `null` kept. Enums as camelCase strings (`"private"`, `"homework"`) except `status` fields (`"Booked"`, `"Active"`) |
| Dates | `date` = `"YYYY-MM-DD"`, `time` = `"HH:mm"`, both **studio time (Asia/Taipei)**. Timestamps (`…At`) are ISO-8601 UTC |
| Errors | RFC 7807 problem JSON: `{ status, title, detail, code }`. `detail` is the Chinese text shown to the user; `code` is stable (`validation`, `not_found`, `slot_taken`, `no_credits`, `disabled`, `pending`, …). Unknown errors → 500 without a stack trace |
| Idempotency | money / credit actions need header **`Idempotency-Key: <uuid>`**; a repeat with the same key returns the first answer (kept 24 h) |
| Undo | most decisions have an undo route; alerts to the student wait `Studio:AlertDelaySeconds` (10 s) so an undone decision is never seen |
| Rate limits | login 10 / min / IP · consult form + password reset 5 / min / IP |
| Uploads | `multipart/form-data`; images checked by content (JPG / PNG / WEBP); receipts ≤ 5 MB, avatar ≤ 2 MB, reel cover ≤ 5 MB |

## 2. All routes

| Method | Path | Auth | Idempotency-Key | Source |
|---|---|---|---|---|
| POST | `/api/auth/forgot-password` | — |  | PublicAuth |
| GET | `/api/auth/line` | — |  | PublicAuth |
| POST | `/api/auth/login` | — |  | PublicAuth |
| POST | `/api/auth/logout` | — |  | PublicAuth |
| POST | `/api/auth/register` | — |  | PublicAuth |
| POST | `/api/auth/reset-password` | — |  | PublicAuth |
| POST | `/api/auth/reset-password/check` | — |  | PublicAuth |
| GET | `/api/me` | — |  | PublicAuth |
| GET | `/api/me/consents` | signed in |  | Privacy |
| POST | `/api/me/consents` | signed in |  | Privacy |
| GET | `/api/public/avatars/{name}` | — |  | PublicAuth |
| POST | `/api/public/consults` | — |  | PublicAuth |
| POST | `/api/public/privacy-requests` | — |  | Privacy |
| GET | `/api/public/reel-covers/{name}` | — |  | Reel |
| GET | `/api/public/reels` | — |  | Reel |
| GET | `/api/public/studio` | — |  | PublicAuth |
| GET | `/api/receipts/{id:guid}` | — |  | Student |
| GET | `/api/slots` | signed in |  | Student |
| GET | `/api/slots/days` | signed in |  | Student |
| GET | `/api/student/alerts` | Student (Active) |  | Student |
| POST | `/api/student/alerts/read` | Student (Active) |  | Student |
| POST | `/api/student/change-requests/{id:guid}/accept` | Student (Active) |  | Student |
| POST | `/api/student/change-requests/{id:guid}/decline` | Student (Active) |  | Student |
| POST | `/api/student/change-requests/{id:guid}/withdraw` | Student (Active) |  | Student |
| GET | `/api/student/fees` | Student (Active) |  | Student |
| GET | `/api/student/lessons` | Student (Active) |  | Student |
| POST | `/api/student/lessons` | Student (Active) | required | Student |
| POST | `/api/student/lessons/{id:guid}/cancel` | Student (Active) |  | Student |
| POST | `/api/student/lessons/{id:guid}/change-requests` | Student (Active) |  | Student |
| POST | `/api/student/lessons/{id:guid}/reports` | Student (Active) | required | Student |
| POST | `/api/student/lessons/{id:guid}/undo-cancel` | Student (Active) |  | Student |
| GET | `/api/student/payments` | Student (Active) |  | Student |
| POST | `/api/student/payments` | Student (Active) | required | Student |
| PUT | `/api/student/profile` | Student (Active) |  | Student |
| POST | `/api/student/reports/{id:guid}/withdraw` | Student (Active) |  | Student |
| PUT | `/api/teacher/account/email` | Teacher |  | TeacherProfile |
| DELETE | `/api/teacher/account/line` | Teacher |  | TeacherProfile |
| POST | `/api/teacher/applications/{id:guid}/{action}` | Teacher |  | Teacher |
| GET | `/api/teacher/availability` | Teacher |  | Teacher |
| DELETE | `/api/teacher/availability/overrides/{date}` | Teacher |  | Teacher |
| PUT | `/api/teacher/availability/overrides/{date}` | Teacher |  | Teacher |
| PUT | `/api/teacher/availability/settings` | Teacher |  | Teacher |
| PUT | `/api/teacher/availability/weekly` | Teacher |  | Teacher |
| POST | `/api/teacher/change-requests/{id:guid}/approve` | Teacher |  | Teacher |
| POST | `/api/teacher/change-requests/{id:guid}/decline` | Teacher |  | Teacher |
| POST | `/api/teacher/change-requests/{id:guid}/undo` | Teacher |  | Teacher |
| GET | `/api/teacher/consults` | Teacher |  | Teacher |
| POST | `/api/teacher/consults/{id:guid}/contacted` | Teacher |  | Teacher |
| GET | `/api/teacher/lessons` | Teacher |  | Teacher |
| POST | `/api/teacher/lessons` | Teacher | required | Teacher |
| POST | `/api/teacher/lessons/{id:guid}/cancel` | Teacher |  | Teacher |
| POST | `/api/teacher/lessons/{id:guid}/proposals` | Teacher |  | Teacher |
| POST | `/api/teacher/lessons/{id:guid}/undo-cancel` | Teacher |  | Teacher |
| GET | `/api/teacher/overview` | Teacher |  | Teacher |
| PUT | `/api/teacher/packages` | Teacher |  | Teacher |
| GET | `/api/teacher/payments` | Teacher |  | Teacher |
| POST | `/api/teacher/payments/{id:guid}/confirm` | Teacher | required | Teacher |
| POST | `/api/teacher/payments/{id:guid}/reject` | Teacher | required | Teacher |
| POST | `/api/teacher/payments/{id:guid}/undo` | Teacher |  | Teacher |
| GET | `/api/teacher/privacy-requests` | Teacher |  | Privacy |
| POST | `/api/teacher/privacy-requests/{id:guid}/done` | Teacher |  | Privacy |
| GET | `/api/teacher/profile` | Teacher |  | TeacherProfile |
| PUT | `/api/teacher/profile` | Teacher |  | TeacherProfile |
| DELETE | `/api/teacher/profile/avatar` | Teacher |  | TeacherProfile |
| POST | `/api/teacher/profile/avatar` | Teacher |  | TeacherProfile |
| POST | `/api/teacher/proposals/{id:guid}/withdraw` | Teacher |  | Teacher |
| GET | `/api/teacher/reels` | Teacher |  | Reel |
| POST | `/api/teacher/reels` | Teacher |  | Reel |
| PUT | `/api/teacher/reels/order` | Teacher |  | Reel |
| DELETE | `/api/teacher/reels/{id:guid}` | Teacher |  | Reel |
| PUT | `/api/teacher/reels/{id:guid}` | Teacher |  | Reel |
| DELETE | `/api/teacher/reminders/{rid:guid}` | Teacher |  | Teacher |
| POST | `/api/teacher/reports/{id:guid}/approve` | Teacher | required | Teacher |
| POST | `/api/teacher/reports/{id:guid}/decline` | Teacher | required | Teacher |
| POST | `/api/teacher/reports/{id:guid}/undo` | Teacher |  | Teacher |
| GET | `/api/teacher/requests` | Teacher |  | Teacher |
| GET | `/api/teacher/students` | Teacher |  | Teacher |
| GET | `/api/teacher/students/{id:guid}` | Teacher |  | Teacher |
| PATCH | `/api/teacher/students/{id:guid}/class-type` | Teacher |  | Teacher |
| PATCH | `/api/teacher/students/{id:guid}/consultation` | Teacher |  | Teacher |
| POST | `/api/teacher/students/{id:guid}/credits` | Teacher |  | Teacher |
| PATCH | `/api/teacher/students/{id:guid}/grade` | Teacher |  | Teacher |
| GET | `/api/teacher/students/{id:guid}/notes` | Teacher |  | Teacher |
| POST | `/api/teacher/students/{id:guid}/notes` | Teacher |  | Teacher |
| POST | `/api/teacher/students/{id:guid}/remind` | Teacher |  | Teacher |
| PATCH | `/api/teacher/students/{id:guid}/status` | Teacher |  | Teacher |

(“required” = the route has the idempotency filter.)

## 3. Main shapes

```ts
StudentSummary {
  id, name, status: 'Pending' | 'Active', classType: 'private' | 'group' | 'trial',
  credits, booked, nextLesson: { date, time } | null, paymentPending, lineId, voiceType, consultationCompleted,
  // 13 Nov
  studentNo: number,            // 學號, 0 = not approved yet
  gender: 'M' | 'F' | null,
  joinedAt: string,             // ISO; 上課資年 = whole months since
  avatarUrl: string | null,
  disabled: boolean,            // 停用
  segment: 'active' | 'noTrial' | 'lapsed' | 'cold' | null
}
StudentDetail extends StudentSummary {
  email, phone, grade, goal, attended, packageSize, upcoming: Lesson[], past: Lesson[], payments: Payment[],
  remindChannel: 'line' | 'email' | null, lastRemindedAt, consent,
  // 13 Nov — 個人資料 header
  firstLessonDate: 'YYYY-MM-DD' | null,  // 最初上課
  firstPurchaseAt: string | null,        // 首次購買課程 (first Confirmed payment)
  totalPaid: number,                     // 購買總額, NT$, Confirmed only
  loginMethod: 'line' | 'email'
}
Payment { id, studentId, studentName, studentAvatarUrl /* 13 Nov */, packageSize, amount, status: 'Pending' | 'Confirmed' | 'Rejected',
  uploadedAt, note, rejectReason, receiptUrl, lqip, trial, fees: { id, amount, date, time }[] }
StudentNote { id, studentId, kind: 'note' | 'homework', text, createdAt }
Reel { id, sortOrder, title, url, coverUrl, coverLqip }
```

## 4. Added 13 Nov 2026

### `GET /api/teacher/students`
List rows for 學生列表 (all non-declined students). New fields above. The client filters by `segment` and pages 8 rows at a time (no server paging yet — fine for one studio; add `?page=` if the list grows past a few hundred).

**segment** (`Services/StudentSegments.cs`, same rules as the mock), checked in order:
1. `active` 活躍 — credits > 0
2. `noTrial` 未上單堂課 — approved, but no **Confirmed** payment ever
3. `lapsed` 未購買課程 — credits 0 and the last lesson started < 91 days ago, or a lesson is still booked
4. `cold` 冷漠 — credits 0, no purchase and no lesson for > 91 days
Pending, declined and disabled students → `null`.

### `GET /api/teacher/students/{id}`
`StudentDetail` with the 個人資料 numbers (`firstLessonDate`, `firstPurchaseAt`, `totalPaid`, `loginMethod`).

### `PATCH /api/teacher/students/{id}/status`
Body `{ "disabled": true | false }` → `200 StudentSummary`. 停用 keeps lessons, credits and history; the student then gets **`403 disabled`** 「帳號已停用，無法預約新的課。請聯絡老師。」 from `POST /api/student/lessons`. Iris can still book for them. Repeating `true` keeps the first `DisabledAtUtc`.

### `POST /api/teacher/students/{id}/notes`
Body `{ "kind": "note" | "homework", "text": "…" }` (1–1000 chars after trim) → `201 StudentNote`.
`homework` also queues an alert for the student (kind `homework`, title 老師給你新的作業, first 80 chars as body).
Errors: `400 validation` (請輸入內容。 / 內容最多 1000 字。 / 類型不正確。), `404 not_found`.

### `GET /api/teacher/students/{id}/notes`
All notes + homework for one student, newest first. (No screen yet — the list will go on the 個人資料 page.)

### Approval (`POST /api/teacher/applications/{id}/approve`)
Now also assigns `studentNo` (max + 1, from 1001) and `joinedOn` = today, if not set yet.

### `GET /api/teacher/payments?status=…`
Each payment now carries `studentAvatarUrl` (for 最近付款記錄 on the teacher home; the home takes the 3 newest by `uploadedAt`).

## 5. Added 12 Nov 2026 (summary)

| Route | What |
|---|---|
| `GET /api/public/reels` · `GET/POST/PUT/DELETE /api/teacher/reels…` · `PUT /api/teacher/reels/order` | 精彩片段: max 8, soft delete + renumber, cover upload (`multipart`: title, url, cover) |
| `GET /api/public/studio` (`packages` field) · `PUT /api/teacher/packages` | 課程方案 editor (size, price, one 單堂課 row) |
| `PATCH /api/teacher/students/{id}/consultation` | 已完成諮詢／面談 → may buy one 單堂課 |
| `POST /api/student/lessons/{id}/reports`, `/api/student/reports/{id}/withdraw`, `/api/teacher/reports/{id}/approve · decline · undo` | 回報 + 取消費 |
| `/api/auth/forgot-password`, `/api/auth/reset-password` | 忘記密碼 |

## 6. Not built on the server yet
- LINE Login callback is real; the `/api/auth/line/mock*` routes exist only in the mock.
- No migration files: run `dotnet ef migrations add Initial` (see `SCHEMA.md`).
- The server has **not been compiled** in this environment (no .NET SDK); C# was syntax-checked only. Run `dotnet build` before deploying.
