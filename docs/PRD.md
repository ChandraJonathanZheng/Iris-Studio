# Iris Studio — Product Requirements Document (PRD)

| | |
|---|---|
| Product | Iris Studio — public website + booking & admin app for Iris's singing studio |
| Owner | Chandra (developer) · Iris (studio owner, primary user) |
| Status | Clickable prototype done (React + mock API); .NET 10 backend implemented with committed migrations and PostgreSQL integration tests |
| Version | v2.2 — 8 Nov 2026 evening: teacher workspace (今日待辦, 收件匣, 更多, 教師個人資料), student detail, legal & privacy (draft). v2.1: Iris's 13 answers (§10). |
| Related docs | `FEATURES.md` · `DESIGN-SYSTEM.md` · `SCHEMA.md` · `FLOW.md` |

---

## 1. Problem

Iris runs a one-teacher singing studio. Her daily admin is manual and repetitive:

- Students ask in LINE chats to book or move lessons; Iris checks her calendar by hand.
- She has to remember who has paid and how many lessons each student has left.
- Payment is bank transfer; receipts arrive as screenshots in chats and get lost.
- New people ask for a trial or consultation through many channels.
- When a student runs out of lessons, Iris has to chase them for the next payment herself.

**Goal:** make these repeated tasks a system, so Iris spends her time teaching instead of on admin.

## 2. Goals and non-goals

### Goals (launch)
1. A public website that introduces Iris and turns visitors into **free consultations**.
2. Students **book, move and cancel** lessons themselves, inside the hours Iris has opened.
3. **Lesson credits (堂數) are tracked automatically.** Students buy a package any time by uploading a transfer receipt; credits never expire. Lessons that have ended become 已上課 by themselves.
4. Iris sees **every student, lesson (past / today / future) and payment** in one place and decides requests in a tap, with **undo**.
5. Iris controls **when students can book** (weekly hours, special dates, lesson length, break, how far ahead).
6. Iris can **remind a student to pay** with one button, and the system reminds automatically when the last credit is booked.
7. Sign-in with **LINE** (main) or email; new accounts need Iris's approval.
8. Iris can **book for a student** and **propose a new time** — but a lesson only moves with the student's consent.

### Non-goals (launch)
- Online payment gateway (payment = bank transfer + receipt image).
- Several teachers or studios.
- Group lessons with several students in one slot (the `group` lesson type is a label only; one booking per slot). **Pending** — decide later.
- Re-applying after Iris declines an account. **Pending** — decide later.
- Homework, recordings, events RSVP (phase 2).
- Native mobile apps (the web app is mobile-first and installable later as a PWA).

## 3. Users

| User | Who | Main jobs |
|---|---|---|
| **Visitor** | Someone curious about lessons | Understand who Iris is, read student stories, ask for a free 15-min chat |
| **Applicant** | Signed up, not approved yet | Wait for Iris, see what happens next |
| **Student** | Approved learner, any age | See next lesson, book / move / cancel, check 堂數, upload receipts, read alerts |
| **Teacher (Iris)** | Studio owner, one account, mostly on her phone | Today's schedule, decide requests, confirm payments, manage students, set availability, remind to pay |

## 4. Requirements

Priority: **P0** = launch, **P1** = soon after, **P2** = later. Full feature list with acceptance criteria: `FEATURES.md`.

### 4.1 Public website (P0)
| ID | Requirement |
|---|---|
| WEB-1 | Page order: Navbar → Hero → Trust strip → About Iris → Benefits → Student stories → Studio events → Final CTA → Footer. |
| WEB-2 | Navbar 56 px, frosted. **免費諮詢** is the primary button, **登入** a text link. |
| WEB-3 | Hero: 找到屬於你的聲音 / 不是唱得更像別人，而是更自在地唱成自己。 CTAs: 免費諮詢 + 看看怎麼上課 ↓. |
| WEB-4 | Benefits: 3 cards. On phones a swipe row (snap, next card peeks, page dots); on desktop 3 columns. No autoplay. |
| WEB-5 | Student stories: one story at a time with a lyric-style text reveal, 7 s autoplay with a progress line, pause button, swipe / arrow keys. Reduced motion: no autoplay, no animation. |
| WEB-6 | Events: 1 featured photo + 2 thumbnails per event, 查看更多照片 opens the rest. |
| WEB-7 | `/consult`: name, contact (LINE / Email switch), preferred time (平日白天 · 平日晚上 · 週末 · 都可以), topic (optional). CTA 和 Iris 聊聊. Rate-limited 5 / min / IP. |
| WEB-8 | All photos, bio and testimonials are placeholders until Iris provides real, consented content. |
| WEB-9 | Footer (blends into the page, max 65rem): IRIS 聲樂工作室 + 陪你找到自己的聲音。, 服務資訊 (服務條款 · 預約與取消政策 · 付款與退款政策 · 聯絡我們) and 隱私與權益 (隱私權政策 · Cookie 政策 · 肖像與影音授權 · 個人資料權利申請), ©, privacy contact. |
| WEB-10 | 7 legal pages at `/legal/:slug`, versioned, **draft until reviewed by a Taiwan lawyer** (banner on every page, 【待填】 placeholders, list of open legal questions). Details: `LEGAL.md`. |

### 4.2 Accounts (P0)
| ID | Requirement |
|---|---|
| AUTH-1 | Login screen: 使用 LINE 登入 (primary), 使用 Email 登入, 老師登入 →, 建立帳號 →. Demo accounts only in demo builds. |
| AUTH-2 | Register: 3-step indicator 建立帳號 → Iris 確認 → 開始預約. LINE register, or name + email + password (≥ 8, show/hide). |
| AUTH-6 | Consents at sign-up (both ways): terms + privacy notice **required**; photo/video/voice promotion and marketing **optional, unchecked**; 我未滿 18 歲 → guardian name, relation, contact + guardian's checkbox. Stored as an append-only consent log with version + time. |
| AUTH-3 | New accounts are **Pending** and see only the 等待 Iris 確認 screen (polls every 10 s, enters the app automatically once approved). |
| AUTH-4 | Session = HttpOnly, SameSite cookie, 30 days sliding. Wrong email or password give the same message. Login rate-limited 10 / min / IP. |
| AUTH-5 | LINE Login (OIDC) issues the same cookie; the LINE `sub` is stored as `LineUserId` (also used for LINE push). |

### 4.3 Student app (P0)
| ID | Requirement |
|---|---|
| ST-1 | **首頁**: 老師想調整上課時間 card on top when Iris proposed a time (可以 / 不方便), 下一堂課 hero (2 天後上課, date, duration · type, room, status, 改時間, small 取消預約), 我的堂數 card, 其他預約 (excludes the next class, ••• menu). |
| ST-2 | **預約**: date strip + time chips generated from Iris's availability; 只顯示空的時段 toggle; compact summary; CTA 請選擇時段 → 確認預約. |
| ST-3 | **改時間**: only **≥ 12 h before** the lesson (later: the option is greyed with the reason, cancel instead). Pick a new slot + reason. The old slot stays booked until Iris approves. One open request per lesson; can be withdrawn. |
| ST-3b | **Iris's proposal**: 可以 moves the lesson (if the slot is still free), 不方便 keeps it. Nothing moves without the student's answer. |
| ST-4 | **取消**: refund the credit if ≥ 24 h before the lesson; the sheet says which case applies before confirming; 30 s undo. |
| ST-5 | **行事曆**: month view with shaped marks (● upcoming ○ done ◆ changing) + list view with filters. |
| ST-6 | **堂數與付款**: credit boxes, bank details, upload receipt (JPG/PNG/WEBP ≤ 5 MB) **any time** (one receipt waiting at a time; credits are added on top), payment history. After Iris confirms a completed consultation/interview, the student also sees 單堂課 NT$1,500 alongside the regular 4 / 8 lesson packages; single lesson is available once. |
| ST-7 | **通知**: alerts list, unread dot (not a number). |
| ST-8 | **我的**: profile (name, email, phone, LINE ID, voice type, goal), **同意設定** (media + marketing switches, withdraw any time, consent history), logout. |
| ST-9 | Home shows Iris's status card (放假中 / 暫停接新學生 / 自訂 + message, public LINE ID) when it isn't 正常上課. |

### 4.4 Teacher app (P0)
| ID | Requirement |
|---|---|
| T-1 | **首頁**: Header → **今日待辦** 2×2 (改時間申請 · 待確認收據 / 新學生 · 諮詢; amber edge + ◆ when > 0, quiet at 0) → 今天的課 (下一堂 highlighted, finished muted) → 堂數用完. |
| T-0 | **Navigation**: 5 tabs 首頁 / 行事曆 / 學生 / **收件匣** / **更多**. 收件匣 = 申請 · 付款 · 諮詢 tabs, ONE count badge (only items Iris must act on). 更多 = 教師個人資料, 可預約時段, 課程方案, 設定, 個資權利申請, 法律文件, 登出. Old routes unchanged. |
| T-2 | **行事曆**: compact month grid + day list (改時間 → propose, 取消 opens a sheet that states the refund + notification policy). Link to 可預約時段. |
| T-3 | **學生**: search, filter chips, compact rows; only exceptions show a status (快用完 / 用完 / 確認中). |
| T-4 | **學生詳細**: profile + quick actions (LINE 聯絡 · 調整堂數 · 編輯) + **media-consent line** (● 同意 / ○ 未同意 / ◆ 已撤回 — 請移除), 課程狀態, **通知學生繳學費**, then ONE lessons container: 下一堂 (sage wash, one action) · 後續課程 (＋ 預約課程) · 上過的課 (3 + 查看全部), latest payment. |
| T-5 | **申請** (in 收件匣): sub-tabs 改時間 · 新學生 · 等學生回覆 (URL `?tab=`). 改時間: old → new, reason, availability, 同意 disabled on conflict, 婉拒 or 婉拒並提議其他時間. 等學生回覆: open proposals + 收回, answers of the last 7 days. Compact cards, friendly empty states. |
| T-6 | **付款**: card action 查看收據並確認 → modal; credits only after ticking 我已核對：金額… (button disabled until then, guarded against double submit + idempotency key); 退回 (reason required). |
| T-7 | **諮詢**: website requests with contact type + preferred time; mark as contacted. |
| T-8 | **可預約時段**: tabs 每週時段 / 特殊日期 / 預約設定 (see §5). |
| T-9 | **通知學生繳學費**: editable message, channel shown (LINE or Email), 24 h repeat warning, sent after 10 s with 復原. |
| T-11 | **教師個人資料**: name, contact LINE ID + "show to students" switch, avatar (≤ 2 MB), 目前狀態 + 狀態訊息 with live preview of the student card, 儲存; separate 登入方式 card (email change needs password, LINE unlink only if another login exists). |
| T-12 | **個資權利申請**: list with due date (15 / 30 days, overdue red); 標為已處理 needs a note. |
| T-10 | Every decision (approve, decline, confirm, cancel, adjust, remind) has **undo**; the student's alert is held back 10 s so a reversed decision is never seen. |

## 5. Business rules

| Rule | Value | Where it lives |
|---|---|---|
| Lesson length | 60 min (30 / 45 / 60 / 90 / 120) | `BookingSettings.LessonMinutes` (Iris edits) |
| Break between lessons | 30 min (0 / 10 / 15 / 30 / 60) | `BookingSettings.GapMinutes` |
| Book ahead | 30 days (7 / 14 / 30 / 60 / 90) | `BookingSettings.AdvanceDays` |
| Default weekly hours | Mon–Sat 09:30–12:30 + 14:00–20:30, Sunday off | `WeeklyAvailability` (seeded) |
| Slot generation | Lesson must **fit** in a range; next start = start + length + break | `AvailabilityService` / `lib/availability.ts` |
| Special date | Replaces the weekly hours for that day (closed or own ranges) | `DateOverride` |
| Slot taken | Any booked lesson that overlaps, break included | `IsTakenAsync` + per-date advisory lock |
| Free cancellation | ≥ 24 h before; Iris's cancellations always refund | `Studio:CancelHours` |
| 改時間 (student) | Only ≥ 12 h before the lesson | `Studio:MoveHours` |
| Iris moves a lesson | Never directly — she proposes, the student accepts | `ChangeRequest.ProposedBy = Teacher` |
| Attendance | A Booked lesson becomes **Attended** when its end time has passed (no check-in); open change requests on it are closed | `AttendanceSettler` (runs every minute) |
| Undo window | 30 s | `Studio:UndoSeconds` |
| Alert delay | 10 s (so undo can pull it back) | `Studio:AlertDelaySeconds` |
| Packages | 單堂課 1 堂 NT$ 1,500 · 4 堂 NT$ 3,200 · 8 堂 NT$ 6,200 | `Studio:Packages` (`Trial: true`) |
| Buy a package | Any time; only one receipt pending at a time; credits are added on top | server rule |
| 單堂課 | Only after Iris confirms a completed 諮詢／面談, once; class type does not grant eligibility (a rejected receipt doesn't count) | `User.ConsultationCompleted` + `Payment.IsTrial` |
| Credit expiry | None | — |
| Lesson type | Copied from the student's class type when booked | `BookAsync` |
| Automatic 繳費提醒 | When a booking uses the last credit; skipped if a receipt is pending or a reminder went out in the last 24 h; dropped if that lesson is cancelled with refund | `AutoRemindAsync` |
| Credits | Book −1 · cancel in time +1 · confirmed receipt +package · manual ± with reason. Never < 0 (DB check). | `CreditLog` audit |
| Receipts | Image only (checked by content), ≤ 5 MB, private to that student + Iris | `/api/receipts/{id}` |
| Time zone | All lesson times are studio time (Asia/Taipei) | `StudioClock` |
| Date format | `MM-DD(週)` e.g. `11-05(四) 16:30`; landing events `YYYY/MM/DD（週）` | `lib/date.ts` |

## 6. Notifications

| Channel | Use | Cost (checked Nov 2026) |
|---|---|---|
| In-app 通知 | Every alert | free |
| LINE Messaging API (push) | Students who signed in with LINE and added the OA as a friend | 輕用量 plan: free, 200 push messages / month |
| Email (Resend) | Students without LINE | Free plan: 3,000 / month, 100 / day |

All alerts go through one outbox (`Alert.SendAfterUtc`) and one `IAlertChannel`. LINE / Resend adapters are implemented. External delivery remains disabled until Iris's credentials are configured (`BACKEND.md`).

## 7. Success metrics (2 months after launch)

| Metric | Target |
|---|---|
| Bookings made by students themselves | ≥ 80 % |
| Receipt upload → confirmation | median < 24 h |
| Double bookings or credit mistakes | 0 |
| Iris's weekly admin time (self-reported) | halved |
| Consult form → first lesson | tracked from launch |

## 8. Non-functional requirements

- **Mobile-first**: phone bottom bar ↔ desktop sidebar at 900 px; every tap target ≥ 44 px; safe areas respected; content never hidden behind the bottom bar.
- **Accessibility**: WCAG 2.2 AA contrast (checked with axe), visible focus, labels on every control, colour never the only signal (shapes ● ○ ◆ ✕), reduced motion honoured, moving content can be paused.
- **Reliability**: idempotency keys on money/credit actions; transactions for book + credit and confirm + credit; DB unique / check constraints; optimistic UI with rollback.
- **Security**: role checks on every route; students only see their own data; receipts private; rate limits; no stack traces to users; bank details from config / env, never in the repo.
- **Performance**: pages interactive < 1 s on 4G for this data size; slots fetched fresh (staleTime 0), other data cached 30 s.
- **Deploy**: one .NET app serves the React build + API on one domain (no CORS).

## 9. Tech stack

React 19 · Vite 6 · TypeScript · React Router 7 · TanStack Query · Vaul (sheets) · cmdk (⌘K) · Phosphor icons · MSW (mock API) — .NET 10 Minimal API · EF Core 10 + Npgsql · PostgreSQL · cookie auth + LINE OIDC · SkiaSharp (receipt previews; see `BACKEND.md`).

## 10. Decisions (8 Nov 2026) and what is still open

| # | Question | Decision |
|---|---|---|
| 1 | When does a lesson count as attended? | Automatically when its time has passed and it wasn't cancelled |
| 2 | When may a student buy a package? | Any time; credits are added to what's left |
| 3 | Slot rule: end inside the range, or only start inside? | The whole lesson must fit inside the range |
| 4 | Trial flow? | Consultation/interview → student registers → Iris approves and marks 已完成諮詢／面談 in 學生 → 編輯 → student chooses 單堂課 NT$1,500 or 4 / 8 lessons → books. |
| 5 | Can Iris move a lesson herself? | No. She proposes (or declines and proposes another time); the student confirms. Same the other way. |
| 6 | Latest time for 改時間? | 12 h before the lesson |
| 7 | LINE add-friend prompt at login? | Yes (`bot_prompt=aggressive`) |
| 8 | Do credits expire? | No |
| 9 | 團體課 with several students per slot? | **Pending** |
| 10 | Re-apply after being declined? | **Pending** |
| 11 | Unify labels? | Yes: 一對一 / 團體課 / 單堂課 everywhere |
| 12 | Automatic payment reminder? | Yes, when the last credit is booked |
| 13 | Teacher books for a student? | Yes, screen built (學生詳細 → 預約課程) |

Still open: real content (photos, bio, testimonials with consent), bank account, decisions 9 and 10.

## 11. Release checklist

- [x] Backend build, committed migrations, and PostgreSQL integration tests
- [ ] Apply the committed migrations to the deployment database (automatic at startup)
- [ ] Real content, prices and bank details (env / user-secrets)
- [ ] Strong teacher password; HTTPS; `Cookie.SecurePolicy = Always`
- [ ] LINE Login + Messaging channels under the same provider, and the Official Account **linked to the LOGIN channel** (needed for the add-friend prompt); Resend domain verified
- [x] 單堂課 price: NT$1,500 (`Studio:Packages`)
- [ ] Backups for PostgreSQL and the receipts folder
- [ ] Remove demo accounts (mock build only)
- [ ] Lawyer review of the 7 legal pages + fill every 【待填】 (`LEGAL.md` §4–5)
- [ ] Self-host the web font; choose a host with encryption at rest
