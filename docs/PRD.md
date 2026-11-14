# Iris Studio — Product Requirements Document (PRD)

| | |
|---|---|
| Product | Iris Studio — public website + booking & admin app for Iris's singing studio |
| Owner | Chandra (developer) · Iris (studio owner, primary user) |
| Status | Clickable prototype done (React + mock API); .NET 10 server written, not yet compiled |
| Version | **v2.5 — 13 Nov 2026**: teacher 首頁 timeline + 最近付款記錄, 學生列表 table (segments, pagination, 停用, 給筆記/給作業), 學生個人資料 page, IG Reels admin, 課程方案 editor, 單堂課 after consultation, one 儲存 motion, coloured alerts, calendar date picker (§4.5, §5). v2.4 — 12 Nov 2026: **忘記密碼** (AUTH-7, AUTH-8), sign-up = Email only with required fields + password rule (AUTH-2). v2.3: **回報 a past lesson** (ST-10, T-13, §5, §10 #14–17) — built in the prototype + server. v2.2 — 8 Nov 2026 evening: teacher workspace (今日待辦, 收件匣, 更多, 教師個人資料), student detail, legal & privacy (draft). v2.1: Iris's 13 answers (§10). |
| Related docs | `FEATURES.md` · `DESIGN-SYSTEM.md` · `SCHEMA.md` · `FLOW.md` · `API.md` |

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
| WEB-1 | Page order: Navbar → Hero → About Iris → Benefits → Student stories → **Reels** → Studio events → Final CTA → Footer (trust strip removed 12 Nov). |
| WEB-12 | **精彩片段 (Instagram Reels)**, above 工作室活動: centred H2 + description + link 在 Instagram 看更多 ↗, then a row of 8 tiles (9:16, swipe; ‹ › buttons on desktop). Tiles are covers only — nothing from Instagram loads until a tap; the tap opens a dialog with Instagram's official embed (`/p/{code}/embed/`), which plays on the page, plus an 在 Instagram 開啟 fallback link. Covers are sample studio photos until Iris provides each reel's cover. Cookie 政策 §三 mentions it. |
| WEB-11 | **About Iris**: H2 「關於 + Iris logo」 (關於 in Noto Serif TC 900, the word Iris is the logo SVG; screen readers hear 關於 Iris), then a **3-D photo carousel** (max 6 photos; centre card flat, neighbours turned away at the edges), moving on by itself every **10 s** with **no controls** (no counter, progress line or buttons — decided 12 Nov); it waits on hover / focus / off-screen / hidden tab and keeps the time already passed. Reduced motion: no autoplay. Then 你好，我是 Iris (H3) + bio. |
| WEB-2 | Navbar 56 px. On the home page it sits **on the hero photo** (transparent, white text) and turns into the frosted bar once the photo has scrolled away. **免費諮詢 ›** = capsule (radius 20 px), transparent background, outline only; **登入** a text link. |
| WEB-3 | Hero = **full-screen photo** (dark gradient for legibility) with a big title 找到屬於你的聲音 and the caption 不是唱得更像別人，而是更自在地唱成自己。 on it, plus 向下滑動 ⌄. When scrolling starts, the title fades out upwards (1.4 s) and the caption follows 0.8 s later (≈ 2.4 s in total); back at the top they return. The photo stays pinned for a short scroll and zooms out slightly. Reduced motion / no JS: static hero, text always visible. |
| WEB-4 | **課程內容**: centred H2 (Noto Serif TC 900, copper #9A5B26 — a warm accent next to the sage), a description line (17–18 px; text to be replaced by Iris), then **3 open columns** (no card box, no swipe; 1 column on phones), each centred: icon → title → caption → sub-caption (e.g. 一對一 · 每堂 1 小時). Icons drawn for the site: mic + note, music notes, headphones — white fill, thin dark outline, no background. Price line removed. |
| WEB-5 | **學生心得**: centred H2 (Noto Serif TC 900, deep sage #2F4A37), description 學生怎麼說 (to be replaced), then **one photo card per student** (3 columns, 1 on phones): photo with a warm wash + dark fade, centred at the bottom **name → testimonial → occupation · 學了多久**. No carousel, no autoplay. Photos and words are samples: real ones need the student's written media consent before launch. |
| WEB-6 | Events: 1 featured photo + 2 thumbnails per event, 查看更多照片 opens the rest. |
| WEB-7 | `/consult`: ‹ 首頁 back link above the title; name \*, contact \* (LINE / Email switch), preferred time \* (平日白天 · 平日晚上 · 週末 · 都可以), topic (optional). The button stays grey and disabled with 「先填寫資訊喔！」 until the 3 required answers are given, then reads 和 Iris 聊聊 (email format checked on send). Rate-limited 5 / min / IP. |
| WEB-8 | All photos, bio and testimonials are placeholders until Iris provides real, consented content. |
| WEB-9 | Footer (blends into the page, max 65rem): IRIS 聲樂工作室 + 陪你找到自己的聲音。 with **social buttons on the right** (Instagram · Facebook · YouTube, round, open in a new tab; no Spotify), 服務資訊 (服務條款 · 預約與取消政策 · 付款與退款政策 · 聯絡我們) and 隱私與權益 (隱私權政策 · Cookie 政策 · 肖像與影音授權 · 個人資料權利申請), ©, privacy contact. |
| WEB-10 | 7 legal pages at `/legal/:slug`, versioned, **draft until reviewed by a Taiwan lawyer** (banner on every page, 【待填】 placeholders, list of open legal questions). Details: `LEGAL.md`. |

### 4.2 Accounts (P0)
| ID | Requirement |
|---|---|
| AUTH-1 | Login screen: Email + 密碼 form (Email checked 0.6 s after typing stops, errors under each box), **忘記密碼？** right under the password box, 登入 (glow on hover), divider 其他 → **LINE 登入** · **師 老師登入**, 建立帳號 →. Demo accounts only in demo builds. |
| AUTH-2 | Register (**Email only**): 3-step indicator 建立帳號 → Iris 確認 → 開始預約. Fields in this order, **all required (red \*)**, each with an example placeholder: Email (checked after typing) → 姓名 → 密碼 (eye) → 確認密碼 (eye, must match). Password rule shown as a live checklist: **≥ 8 characters, ≥ 1 upper-case, ≥ 1 lower-case, ≥ 1 number** (also enforced by the server). Then 開始之前 consents (no box, blends into the page; a minor's guardian fields are required too), then 建立帳號 (glow on hover). Submitting with empty fields shows 「〈欄位〉不能空白。」 under each one and focuses the first. |
| AUTH-6 | Consents at sign-up (both ways): terms + privacy notice **required**; photo/video/voice promotion and marketing **optional, unchecked**; 我未滿 18 歲 → guardian name, relation, contact + guardian's checkbox. Stored as an append-only consent log with version + time. |
| AUTH-3 | New accounts are **Pending** and see only the 等待 Iris 確認 screen (polls every 10 s, enters the app automatically once approved). |
| AUTH-4 | Session = HttpOnly, SameSite cookie, 30 days sliding. Wrong email or password give the same message. Login rate-limited 10 / min / IP. |
| AUTH-7 | **忘記密碼** (`/forgot-password`): Email only (required, checked after typing) → 寄送重設連結. The answer is **always the same** (「如果這個 Email 有註冊…」), so the page can't reveal who has an account. The email holds a link `/reset-password?token=…`: random 256-bit token, **valid 30 min, single use**, stored only as a SHA-256 hash; asking again cancels older links; max 1 email / minute / account + IP rate limit. LINE-only accounts (no password) get no email. |
| AUTH-8 | **設定新密碼** (`/reset-password`): the link is checked first (expired/used → 「連結已失效」 + 重新申請). Only 新密碼 \* and 確認新密碼 \* (eye buttons, placeholders, errors under each box), the same live password checklist + 「不能和最近 3 次的密碼相同」. 確認 button bottom-right with hover + press effect; on click it shows **處理中…**, turns grey and is disabled. The new password must differ from the **last 3 passwords** (`PasswordHistories`). Success → /login with 「密碼已更新，請用新密碼登入。」 |
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
| ST-6 | **堂數與付款**: credit boxes, **未付取消費** line (amount + which lessons) when there is one, the amount to transfer = package price + unpaid fees, bank details, upload receipt (JPG/PNG/WEBP ≤ 5 MB) **any time** (one receipt waiting at a time; credits are added on top), payment history. A 體驗 student who hasn't tried yet sees only the 體驗課 package. |
| ST-7 | **通知**: alerts list, unread dot (not a number). |
| ST-8 | **我的**: profile (name, email, phone, LINE ID, voice type, goal), **同意設定** (media + marketing switches, withdraw any time, consent history), logout. |
| ST-10 | **回報 (past lesson)**: every lesson in the 上過的課 / 已上課 list of 行事曆 has a **回報** button while it is inside the report window (§5). Tap → modal 「要申請取消這堂課嗎？」 that states the result before confirming: *若老師同意：退回 1 堂，下次繳費加收取消費 NT$ 500。* Buttons **返回** (close, back to the list, nothing changes) / **確定** (send). After 確定 the row shows ◆ 待審核 instead of the button and can be 撤回 while Iris hasn't decided; after the decision it shows ✕ 已取消（回報）· 取消費 NT$ 500 or stays ○ 已上課 with Iris's reason. One report per lesson. |
| ST-9 | Home shows Iris's status card (放假中 / 暫停接新學生 / 自訂 + message, public LINE ID) when it isn't 正常上課. |

### 4.4 Teacher app (P0)
| ID | Requirement |
|---|---|
| T-1 | **首頁** (13 Nov): centred date `Friday, 2026 - 11 - 13` → big centred greeting `午安，Iris Chen !` + thin caption → **今日待辦** subtitle + embossed rule, 2×2 cards (學生申請 = 改時間 + 回報 · 待確認收據 / 新學生 · 諮詢; amber edge when > 0); **only the → arrow (top-right) is a link**, not the whole card → **今天的課** card (title inside, rule under it): a **timeline** — one line, a black-outlined dot per class (past grey 已上過, next amber 下一堂, later black 已預約), and a small white **now-dot with a slowly glowing blue ring** that moves from one class's start to the next in proportion to the clock (merges with a class dot at its start; the row turns grey once its start has passed, label 上課中 until it ends) → **最近付款記錄** card: the 3 latest receipts by upload time (photo, bold name, thin label 一對一 / 團體課 / 新學生, `yyyy - MM - dd HH:mm:ss`, 查看收據 link that glows on hover and grows into a centred receipt pop-up over a blurred page; X shrinks it back) + 查看所有付款記錄 › (a receipt icon bounces in the centre while the page changes). |
| T-0 | **Navigation**: 5 tabs 首頁 / 行事曆 / 學生 / **收件匣** / **更多**. 收件匣 = 申請 · 付款 · 諮詢 tabs, ONE count badge (only items Iris must act on). 更多 = 教師個人資料, 可預約時段, 課程方案, 設定, 個資權利申請, 法律文件, 登出. Old routes unchanged. |
| T-2 | **行事曆**: compact month grid + day list (改時間 → propose, 取消 opens a sheet that states the refund + notification policy). Link to 可預約時段. |
| T-3 | **學生列表** (13 Nov): breadcrumb 首頁 / 學生 / 列表, 共 N 位, search (name, ID, LINE ID), filter chips **全部 · 活躍 · 冷漠 · 未購買課程 · 未上單堂課** with counts (rules §5), then a **table**: ID (學號) · photo + 學生 · 性別 · 聲部 · 上課資年 (m) · 堂課額度 · 操作 [人像 → 個人資料 | LINE → chat | ⋯ menu: 編輯 · 給筆記 · 給作業 · 停用 / 重新啟用]. Header white, bold black, everything centred. **8 per page** (« ‹ 第 1 / 2 頁 › »), page resets on search/filter. **No multi-select.** Phone: table scrolls sideways with ID + name pinned. 停用 rows are grey and sorted last. |
| T-4 | **學生個人資料** (13 Nov, layout like a profile page): breadcrumb 首頁 / 列表 / 個人資料 → cover band with the round photo on its edge → name (+ class-type badge), email, LINE ID; **two icons top-right**: chat (LINE) · bell (通知學生繳費, amber when ≤ 1 堂 left) → 4-column stats with hairline dividers: **最初上課** `yyyy.MM.dd` · **首次購買課程** `yyyy.MM.dd` · **購買總額** `$3,200.00` (confirmed payments) · **學習資歷** `14 月` → rows (label + hint left, content right): **個人帳號資訊** (全名, 登入方式 LINE / EMAIL, 編輯課程類型) · **基本資料** (聲部, 程度, 電話, media-consent line). The lessons / 課程狀態 / 付款 blocks were removed from this page (13 Nov); their sheets (調整堂數, 幫學生預約, 提議改時間, 付款紀錄) still exist as routes — **open: where to link 調整堂數 and 幫學生預約 from**. |
| T-5 | **申請** (in 收件匣): sub-tabs 改時間 · **回報** · 新學生 · 等學生回覆 (URL `?tab=`; 回報 → T-13). 改時間: old → new, reason, availability, 同意 disabled on conflict, 婉拒 or 婉拒並提議其他時間. 等學生回覆: open proposals + 收回, answers of the last 7 days. Compact cards, friendly empty states. |
| T-6 | **付款**: card action 查看收據並確認 → modal (expected amount = package price **+ the 取消費 billed on this receipt**, listed line by line); credits only after ticking 我已核對：金額… (button disabled until then, guarded against double submit + idempotency key); 退回 (reason required). |
| T-7 | **諮詢**: website requests with contact type + preferred time; mark as contacted. |
| T-8 | **可預約時段**: tabs 每週時段 / 特殊日期 / 預約設定 (see §5). |
| T-9 | **通知學生繳學費**: editable message, channel shown (LINE or Email), 24 h repeat warning, sent after 10 s with 復原. |
| T-11 | **教師個人資料**: name, contact LINE ID + "show to students" switch, avatar (≤ 2 MB), 目前狀態 + 狀態訊息 with live preview of the student card, 儲存; separate 登入方式 card (email change needs password, LINE unlink only if another login exists). |
| T-12 | **個資權利申請**: list with due date (15 / 30 days, overdue red); 標為已處理 needs a note. |
| T-13 | **回報 審核** (申請 → 回報, status 待審核): card = student, lesson date/time, when it was reported. **同意** → lesson becomes 已取消（回報）, **+1 堂** back, a **取消費 NT$ 500** is added to the student's next payment; **婉拒** (reason required) → lesson stays 已上課, nothing changes. Both have 復原 (T-10) and alert the student after 10 s. Counts in the 收件匣 badge and the 學生申請 tile. |
| T-19 | **學生 › 課程** (📖 in 學生列表 and on 個人資料): breadcrumb 首頁 / 列表 / 課程 → name + `一對一 · N 堂課` → 3-column band: **學習目標** (the student's goal) · **技能徽章** (outlined capsules, ＋ 新增 with suggestions, × removes; ≤ 12) · numbers 剩餘 (調整) · 總堂數 · **成長等級** 0–10 with (i) + 編輯 stepper · 缺課 → **課程中心**: 上課紀錄 (last 3, `Monday, 2026-11-05 16:00`, ✓ attended · ↻ moved · ✕ 回報-cancelled; → opens all) | 下一堂課 (改時間 + 筆記 capsules, big `FRI`, date, time). 上課紀錄 and 下一堂課 are two separate cards. **Iris does not book for students** — no 預約 button anywhere on the teacher side. |
| T-20 | **編輯聲部與程度** (個人資料 › 基本資料): sheet with two dropdowns (6 voice types / Grade 1–8), only the teacher can change 程度. |
| T-21 | **課堂筆記** (今天的課): once the now-dot reaches a class, a notebook icon appears before its status (and stays). It opens a dialog: 1. 輸入文字 (rich text, default) or 2. 上傳截圖 (converted to WebP, named `yyyyMMdd_學生_Class_Notes.webp`, original discarded, bound to the lesson and student). With a note, the icon is filled; the dialog previews it, and 刪除 clears it locally so Iris can redo it — the server keeps the old note until the new one is saved. Also on every past class in 行事曆 (14 Nov). Teacher-only for now. |
| T-22 | **收據審核 — B Financial Highlight V2** (14 Nov): receipt card = name · `yyyy-MM-dd HH:mm 上傳` (Asia/Taipei) · status badge top-right; 購買課堂 and 付款金額 in two highlighted panels; note only when present; actions 退回 / 審核收據 (opens the receipt — credits are added only from inside it, after the amount check). Status labels: Pending 待審核 · Confirmed 已確認 (read-only) · Rejected 需補件 (reason + 等待學生重新上傳). Confirm is not optimistic: the receipt stays open with a spinner until the server confirms; errors show inline. **Open:** 已婉拒 (final rejection, no re-upload) has no backend status yet. |
| T-14 | **給筆記 / 給作業** (學生列表 ⋯): centred dialog with a textarea (1–1000 chars, counter). 筆記 = only Iris sees it; 作業 = the student gets a 通知 (kind `homework`). Saved with the shared 儲存 motion. |
| T-15 | **停用 / 重新啟用** (學生列表 ⋯): confirm dialog 「停用 X？」; a disabled student keeps lessons, credits and history but **cannot book new lessons** (Iris still can); 重新啟用 has no confirm. |
| T-16 | **IG Reels admin** (更多 → IG Reels): breadcrumb 設定 / 列表頁 / 編輯; list of max 8, drag the 3-line handle (or ↑↓) to sort, title links to the reel, 編輯 / 刪除 (confirm 「你確定要刪除這一則？」 返回 / 刪除, soft delete + renumber). Edit page: 排序號, IG 自訂標題 \* (≤ 60), Reels 連結 \* (checked 0.6 s after typing), 封面圖 upload (9:16 preview, 建議 1080 × 1920), 取消 / 儲存. |
| T-17 | **課程方案** (更多 → 課程方案): Iris edits package sizes and prices (max 8 rows + the 單堂課 row); students see new prices at once, receipts already uploaded keep their amount. |
| T-18 | **取消課程 → done window**: after Iris cancels a lesson a big centred **red** window 「已取消這堂課」 shows student + slot + 堂數已退回, buttons **OK!** (black capsule) and a bigger **復原（10）** with the seconds left of the 10 s undo window (then 已通知學生). OK or a tap outside shrinks it to the centre, the blur clears, back on 行事曆. |
| T-10 | Every decision (approve, decline, confirm, cancel, adjust, remind) has **undo**; the student's alert is held back 10 s so a reversed decision is never seen. |

### 4.5 Shared UI behaviour (13 Nov)
| ID | Requirement |
|---|---|
| UI-1 | **儲存 buttons** (every save): label falls back and fades → 3 blue dots bounce (at least 0.9 s) → check mark draws itself + "Saved" (1.3 s) → then the sheet closes / page moves on. On failure the button returns and the form stays open. Double taps are ignored. Reduced motion: no animation. |
| UI-2 | **Alerts (toast)**: drop in from the top with a quick fade, stay **1.5 s**, rise and fade out. Success = green + white text + ✓; Warning = yellow + black text + !; Error = red + white text + ✕. With 復原: stays 5 s. Only the 復原 button takes taps (the alert never blocks the top bar). Pauses while hovered / focused. |
| UI-3 | **Date inputs**: tapping opens a month calendar on **today** (or the chosen date), today ringed blue, past days disabled, 今天 / 關閉, keyboard ← → ↑ ↓ PageUp/PageDown Enter Esc. Today only used in 特殊日期. |
| UI-4 | Login / logout show a white 30 % blur overlay with a spinner (min 0.6 s). |
| WEB-13 | **Reel player**: the tapped tile squashes, then flies to the centre while growing (overshoot pop); the page goes clear → blur → dark. Phone: almost full screen; desktop: up to the 9:16 max width, the rest blurred black. Closing: swells a little, then shrinks fast back into its tile while the backdrop goes dark → blur → clear. |

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
| 回報 window | Only for **Attended** lessons, until **7 days** after the lesson ended (待 Iris 確認). One report per lesson; Open → 撤回 allowed | `Studio:ReportDays` |
| 回報 approved | Lesson → Cancelled (`CancelledByReport`) · credits **+1** (CreditLog `report:{id}`) · one `CancellationFee` NT$ 500 | `Studio:CancelFee` |
| 取消費 → next payment | Unpaid fees are **attached to the next receipt the student uploads** (amount due = package + fees). Confirmed → fees Paid. Rejected → fees go back to Unpaid for the next upload. A receipt already waiting when the fee is created is not changed | `CancellationFee.PaymentId` |
| Attendance | A Booked lesson becomes **Attended** when its end time has passed (no check-in); open change requests on it are closed | `AttendanceSettler` (runs every minute) |
| Undo window | 30 s | `Studio:UndoSeconds` |
| Alert delay | 10 s (so undo can pull it back) | `Studio:AlertDelaySeconds` |
| Packages | 體驗課 1 堂 NT$ 800 (placeholder price) · 4 堂 NT$ 3,200 · 8 堂 NT$ 6,200 | `Studio:Packages` (`Trial: true`) |
| Buy a package | Any time; only one receipt pending at a time; credits are added on top | server rule |
| 體驗課 | Only for students whose class type is 體驗, once (a rejected receipt doesn't count) | `Payment.IsTrial` |
| Credit expiry | None | — |
| Lesson type | Copied from the student's class type when booked | `BookAsync` |
| Automatic 繳費提醒 | When a booking uses the last credit; skipped if a receipt is pending or a reminder went out in the last 24 h; dropped if that lesson is cancelled with refund | `AutoRemindAsync` |
| Credits | Book −1 · cancel in time +1 · confirmed receipt +package · manual ± with reason. Never < 0 (DB check). | `CreditLog` audit |
| Receipts | Image only (checked by content), ≤ 5 MB, private to that student + Iris | `/api/receipts/{id}` |
| Time zone | All lesson times are studio time (Asia/Taipei) | `StudioClock` |
| Password | ≥ 8 chars, ≥ 1 upper, ≥ 1 lower, ≥ 1 digit; not one of the last 3 | `PasswordService.RuleProblem` · `lib/password.ts` |
| Reset link | 30 min, once, newest only, 1 / min / account | `Studio:ResetLinkMinutes`, `PasswordResetTokens` |
| Date format | `MM-DD(週)` e.g. `11-05(四) 16:30`; landing events `YYYY/MM/DD（週）` | `lib/date.ts` |
| 學號 (ID) | 1001, 1002 … assigned when Iris approves an application; unique | `Users.StudentNo` |
| 上課資年 / 學習資歷 | Whole months since `JoinedOn` (set on approval, Iris can correct it) | `Users.JoinedOn` |
| 學生分類 (list filter) | One group per student, checked in order: **活躍** = credits > 0 · **未上單堂課** = approved but no confirmed purchase ever · **未購買課程** = credits 0 and last lesson < 3 months ago (or a lesson still booked) · **冷漠** = credits 0, no purchase and no lesson for > 3 months (91 days). Pending / 停用 = none | `StudentSegments.Classify` |
| 停用 | Keeps lessons, credits, history; student can't book new lessons (403 `disabled`); Iris can still book for them | `Users.DisabledAtUtc` |
| 作業 | Creates a `homework` alert for the student (title 老師給你新的作業) | `StudentNotes`, `AlertKind.Homework` |

## 6. Notifications

| Channel | Use | Cost (checked Nov 2026) |
|---|---|---|
| In-app 通知 | Every alert | free |
| LINE Messaging API (push) | Students who signed in with LINE and added the OA as a friend | 輕用量 plan: free, 200 push messages / month |
| Email (Resend) | Students without LINE | Free plan: 3,000 / month, 100 / day |

All alerts go through one outbox (`Alert.SendAfterUtc`) and one `IAlertChannel`. Real LINE / email delivery is plugged in once Iris's LINE OA and Resend account exist.

**課堂改期申請 notifications (B1, 14 Nov 2026).** Every reschedule event notifies both sides, in-app (the Alert row) and by email (`EmailAlertChannel`, alerts whose Source is `change:…` only):

| Event | Student | Teacher |
|---|---|---|
| Student submits 改期申請 | — | 學生申請改期 (immediately) |
| Iris 同意改期 / 婉拒 | 老師同意改時間 / 老師無法改到這個時間 | 已同意改期 / 已婉拒改期 |
| Student answers Iris's 提議 | — | 學生已同意改期 / 學生不方便改期 |

Decisions by Iris are delayed by the undo window; Undo drops both alerts (same Source), so no "never mind" email is sent. Until a real provider is configured, `LogEmailSender` writes the email to the log. The teacher has no alert list yet; her in-app signals are the 收件匣 badge and the toast.

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

React 19 · Vite 6 · TypeScript · React Router 7 · TanStack Query · Vaul (sheets) · cmdk (⌘K) · Phosphor icons · MSW (mock API) — .NET 10 Minimal API · EF Core 10 + Npgsql · PostgreSQL · cookie auth + LINE OIDC · ImageSharp (receipt previews).

## 10. Decisions (8 Nov 2026) and what is still open

| # | Question | Decision |
|---|---|---|
| 1 | When does a lesson count as attended? | Automatically when its time has passed and it wasn't cancelled |
| 2 | When may a student buy a package? | Any time; credits are added to what's left |
| 3 | Slot rule: end inside the range, or only start inside? | The whole lesson must fit inside the range |
| 4 | Trial flow? | 15-min chat → student registers → Iris approves → student buys 體驗課 (1 lesson, NT$ price) → books. Done. |
| 5 | Can Iris move a lesson herself? | No. She proposes (or declines and proposes another time); the student confirms. Same the other way. |
| 6 | Latest time for 改時間? | 12 h before the lesson |
| 7 | LINE add-friend prompt at login? | Yes (`bot_prompt=aggressive`) |
| 8 | Do credits expire? | No |
| 9 | 團體課 with several students per slot? | **Pending** |
| 10 | Re-apply after being declined? | **Pending** |
| 11 | Unify labels? | Yes: 一對一 / 團體課 / 體驗課 everywhere |
| 12 | Automatic payment reminder? | Yes, when the last credit is booked |
| 13 | Teacher books for a student? | **No** (13 Nov) — only students book. Screen, route and endpoint removed |
| 14 | Can a student cancel a lesson that has already passed? | Yes, via **回報** → Iris reviews. If she agrees: +1 堂 back and 取消費 NT$ 500 on the next payment (12 Nov 2026) |
| 15 | How long after the lesson can a student 回報? | **Pending** — built with 7 days (`Studio:ReportDays`), confirm with Iris |
| 16 | Can Iris waive the 取消費 for one report (illness, emergency)? | **Pending** — built as a 這次免收取消費 tick box on the 回報 card (off by default), confirm with Iris |
| 17 | Does the student give a reason when reporting? | **Pending** — built as optional 原因（選填）in the dialog, confirm with Iris |

Still open: real content (photos, bio, testimonials with consent), the real 體驗課 price, bank account, decisions 9, 10 and 15–17. The 取消費 must also be written into 預約與取消政策 and 付款與退款政策 (`LEGAL.md`) before launch.

## 11. Release checklist

- [ ] `dotnet build`, then `dotnet ef migrations add Initial` + `database update` (includes 13 Nov: `Users.StudentNo/Gender/JoinedOn/DisabledAtUtc`, `StudentNotes`)
- [x] 調整堂數 lives on 學生 › 課程 (剩餘 › 調整); 幫學生預約 removed (13 Nov)
- [ ] Real content, prices and bank details (env / user-secrets)
- [ ] Strong teacher password; HTTPS; `Cookie.SecurePolicy = Always`
- [ ] LINE Login + Messaging channels under the same provider, and the Official Account **linked to the LOGIN channel** (needed for the add-friend prompt); Resend domain verified
- [ ] Confirm the 體驗課 price with Iris (`Studio:Packages`)
- [ ] Backups for PostgreSQL and the receipts folder
- [ ] Remove demo accounts (mock build only)
- [ ] Add the 回報 / 取消費 NT$ 500 rule to 預約與取消政策 + 付款與退款政策, and have the lawyer check it
- [ ] Lawyer review of the 7 legal pages + fill every 【待填】 (`LEGAL.md` §4–5)
- [ ] Email provider for 忘記密碼 (Resend: verified domain) — today `LogEmailSender` only writes the link to the server log; set `Studio:PublicUrl` to the real https address (links are built from it, never from the request Host header)
- [ ] After a password reset, sign out the account's other sessions (needs a security stamp in the cookie — not built yet)
- [ ] Self-host the web font; choose a host with encryption at rest
