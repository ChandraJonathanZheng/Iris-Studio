# Iris Studio — Features

Version 12 Nov 2026 (v2.4: 回報 + 取消費, 忘記密碼 + password rules — in the demo `docs/demo/iris-studio-demo.html`; source not yet in this branch) · every feature below is in the clickable prototype unless marked.
Status: ✅ built (client + mock API + backend implementation; backend validated with PostgreSQL integration tests) · 🟡 built, external service still to connect · ⬜ planned.
Priorities match `PRD.md` (P0 launch · P1 soon · P2 later).

---

## A. Public website

| # | Feature | Pri | Status | Acceptance criteria |
|---|---|---|---|---|
| A1 | Frosted navbar | P0 | ✅ | 56 px; 免費諮詢 primary, 登入 text link; section links on desktop |
| A2 | Hero | P0 | ✅ | Headline + subline before the photo; CTAs 免費諮詢 / 看看怎麼上課 ↓ (scrolls to benefits) |
| A3 | Trust strip | P0 | ✅ | 3 equal columns: [N] 年 教學經驗 · 1 對 1 每堂 1 小時 · 3 種曲風 |
| A4 | About Iris | P0 | ✅ | Portrait + 2 short paragraphs (placeholder copy) |
| A5 | Benefits swipe | P0 | ✅ | Phone: snap row, next card peeks, dots (tap = jump), active card full / others 96 % + faded; desktop 3 columns; no autoplay; keyboard scrollable |
| A6 | Student stories | P0 | ✅ | One story; characters rise in like lyrics; 7 s progress line; pauses on hover / focus / touch; ⏸ ‹ › + initials tabs; swipe + arrow keys; reduced motion = static |
| A7 | Studio events | P1 | ✅ | 1 featured + 2 thumbnails, 查看更多照片（n） reveals the rest |
| A8 | Final CTA | P0 | ✅ | 還不確定從哪裡開始？ / 免費聊 15 分鐘 / no-pressure caption / student login link |
| A9 | 免費諮詢 page | P0 | ✅ | 3-step journey; 名字, LINE/Email switch (input changes), time chips, optional topic; 和 Iris 聊聊; thank-you state that repeats the chosen channel + time; 5 / min / IP |

## B. Accounts

| # | Feature | Pri | Status | Acceptance criteria |
|---|---|---|---|---|
| B1 | Login | P0 | ✅ | Email + 密碼 form first (live email check, errors under each box), 忘記密碼？ under the password, then 其他 → LINE 登入 · 師 老師登入, 建立帳號 →; same error for wrong email / password |
| B2 | Demo accounts | — | ✅ | 示範帳號 box only in mock / demo builds |
| B3 | Register | P0 | 🟡 demo | Journey 建立帳號 → Iris 確認 → 開始預約; Email only: Email → 姓名 → 密碼 → 確認密碼, all required (red \*), placeholders; live checklist ≥ 8 · 大寫 · 小寫 · 數字; 「〈欄位〉不能空白。」 per field |
| B4 | Pending screen | P0 | ✅ | 申請已送出 / 等待 Iris 確認 + review icon; auto-enters when approved; 不是 X？切換帳號 |
| B5 | LINE Login | P0 | 🟡 | OIDC flow coded with `bot_prompt=aggressive` (add-friend prompt on the login screen); needs LINE channel id/secret + OA linked |
| B7 | Re-apply after decline | — | ⬜ | **Pending decision** |
| B6 | 忘記密碼 / 設定新密碼 | P0 | 🟡 demo | `/forgot-password`: same answer whether or not the email exists; 256-bit single-use link, **30 min**, SHA-256 stored, newest only, 1 / min / account; `/reset-password`: link checked first (連結已失效 + 重新申請), 新密碼 + 確認新密碼, same checklist + not one of the **last 3** passwords, 確認 → 處理中… (disabled); other sessions signed out; LINE-only accounts excluded. Delivery needs Resend |

## C. Student app

| # | Feature | Pri | Status | Acceptance criteria |
|---|---|---|---|---|
| C0 | Home — Iris's proposal | P0 | ✅ | Card on top: 老師想調整上課時間, old (struck) → **new**, Iris's message, 可以，改到這個時間 / 不方便; accept fails politely if the slot was taken |
| C1 | Home — next class | P0 | ✅ | 今天上課 / 明天上課 / N 天後上課; date tile; duration · type · room; ● 已確認 or pending change; 改時間 main (hidden < 12 h before), 取消預約 small text |
| C2 | Home — 我的堂數 | P0 | ✅ | 剩餘 N 堂, 40 px boxes (attended / booked / free), legend, 預約課程, 查看堂數與付款紀錄 → |
| C3 | Home — 其他預約 | P0 | ✅ | Only lessons after the next one; ••• menu (改時間 / 取消預約); hidden when empty |
| C4 | Book | P0 | ✅ | Date strip (休息 / 額滿 / 已過 / 未開放 disabled), time chips from availability, 只顯示空的時段, summary with remaining credits, CTA 請選擇時段 → 確認預約, success screen |
| C5 | Change time | P0 | ✅ | Only ≥ 12 h before (else greyed with 上課前 12 小時內不能改 + link to cancel); new slot + reason; original stays booked; withdraw; one open request per lesson |
| C6 | Cancel | P0 | ✅ | Sheet states refund / no refund before confirming; 30 s undo |
| C7 | Calendar | P0 | ✅ | Month (● ○ ◆ marks, legend) + list with 過去 / 今天 / 即將 filters |
| C8 | 堂數與付款 | P0 | ✅ | Bank details, package choice, receipt upload (image ≤ 5 MB) **any time** (blocked only while a receipt is waiting), credits added on top, no expiry; Iris-confirmed consultation/interview students also see 單堂課 · 1 堂 · NT$1,500 alongside 4 / 8 lesson packages, once; history with status |
| C9 | 通知 | P0 | ✅ | List, unread **dot** (not a count), mark all read; reminders and Iris's proposals (到首頁回覆 →) appear here too |
| C11 | 回報 (past lesson) | P0 | 🟡 demo | 行事曆 → 列表 → 過去: **回報** on 已上課 lessons up to 7 days after; dialog 要申請取消這堂課嗎？ states +1 堂 and 取消費 NT$ 500 first, optional reason; 返回 sends nothing, 確定 → ◆ 待審核 (撤回 while open); then ✕ 已取消（回報）with the fee, or 已上課 + Iris's reason. 堂數與付款 shows 未付取消費 and the total to transfer |
| C10 | Profile | P0 | ✅ | Edit name, email, phone, LINE ID, voice type, goal; logout |

## D. Teacher app

| # | Feature | Pri | Status | Acceptance criteria |
|---|---|---|---|---|
| D1 | Home | P0 | ✅ | 今天的課 (upcoming first, 下一堂 highlight, 已結束 group muted), 4 counters, 堂數用完 with 收據待確認 → chip |
| D2 | Calendar | P0 | ✅ | Compact month (40 px rows), day list (time · name · ● / ◆ status), 改時間 → propose sheet, small 取消 → policy sheet, 可預約時段 shortcut; ended lessons are 已上課 automatically |
| D3 | Students list | P0 | ✅ | Search 54 px, filter chips (scroll), 81 px rows, deterministic avatar tones, credits number coloured, status column only for exceptions |
| D4 | Student detail | P0 | ✅ | Profile + LINE 聯絡 / 調整堂數 / 編輯; 課程狀態 (剩餘 · 已預約 · 下一堂); upcoming with ＋ 預約課程, 提議改時間 per lesson, student requests (查看申請 →) and own proposals (◆ 等待學生回覆 · 收回); latest payment + 查看付款紀錄 →; history list |
| D5 | 調整堂數 | P0 | ✅ | Sheet: 增加/減少, 1–4, reason required (補課 / 贈送 / 修正錯誤 / 其他 + note), preview `5 → 7`, cannot go below 0, undo, audit log |
| D6 | 編輯 (class type) | P0 | ✅ | 一對一 / 團體課 / 單堂課 (same labels as lessons); the class type becomes the lesson type when booking; 已完成諮詢／面談 checkbox separately unlocks the one-time single lesson |
| D7 | 通知學生繳學費 | P0 | 🟡 | Button in 課程狀態 (filled when ≤ 1 credit); sheet shows channel + recipient, editable draft (≤ 500), 24 h repeat warning; sent after 10 s with 復原; shows 上次提醒. Delivery needs LINE OA / Resend keys |
| D8 | Requests — 改時間 | P0 | ✅ | Old (muted) → **new** time, 「reason」, ● 新時段可用 / 新時段已被預約 + explanation, 同意 disabled on conflict, 婉拒 with message or **婉拒並提議其他時間**, undo; 你的提議 list (等待學生回覆 + 收回, 學生已接受 / 學生不方便 + 再提議, 7 days) |
| D9 | Requests — 新學生 | P0 | ✅ | Name, applied time, email or LINE, 確認 / 婉拒, undo |
| D10 | Payments | P0 | ✅ | Tabs 待確認 / 已確認 / 已退回; cards with 「note」; **receipt modal** (dimmed page, image never cropped, decide inside); 退回 needs a reason; idempotent confirm; undo |
| D11 | Consults | P0 | ✅ | Contact type + preferred time window; mark contacted |
| D12 | 可預約時段 — 每週時段 | P0 | ✅ | Mon–Sun toggles; ranges as chips (tap = edit sheet, trash = delete); + 新增時段; live preview of generated slots; overlap / too-short warnings |
| D13 | 可預約時段 — 特殊日期 | P0 | ✅ | Date, 全天休息 / 自訂時段 (multi-range), note; shows usual hours for that weekday; warns about existing lessons (never auto-cancels) |
| D14 | 可預約時段 — 預約設定 | P0 | ✅ | 每堂課時長, 課程間隔, 可提前預約 (selects); students' slots update immediately |
| D15 | ⌘K command menu | P1 | ✅ | Jump to any page / common action |
| D16 | Book for a student | P0 | ✅ | 學生詳細 → ＋ 預約課程 sheet: slot picker (first open day preselected), "uses 1 堂, N left", student gets 老師新增了一堂課; blocked with a link to 調整堂數 at 0 credits; idempotent |
| D17 | Automatic reminder at 0 credits | P0 | 🟡 | Queued by the booking that uses the last credit; skipped if a receipt is pending or a reminder went out < 24 h ago; dropped if that lesson is cancelled with refund. Delivery as D7 |
| D18 | Propose a new time | P0 | ✅ | Sheet from 學生詳細, 行事曆 or 婉拒: slot picker + message; replaces the student's open request; lesson moves only on the student's 可以 |
| D19 | Automatic attendance | P0 | ✅ | Booked lessons become 已上課 once their end time passes (server job every minute) |
| D21 | 回報 審核 | P0 | 🟡 demo | 收件匣 → 申請 → **回報** sub-tab (counted in the 收件匣 badge and 學生申請 tile): student, lesson, reason, effect line; 這次免收取消費 tick box; 同意 (+1 堂, fee on next receipt) / 婉拒 (reason required); undo 30 s (blocked once the fee is on a receipt); receipt modal lists 方案 + 取消費 |
| D20 | 團體課 (several students per slot) | — | ⬜ | **Pending decision** |

## E. Cross-cutting

| # | Feature | Status | Notes |
|---|---|---|---|
| E1 | Undo everywhere | ✅ | 30 s server window, toast 5 s |
| E2 | Delayed student alerts | ✅ | 10 s outbox |
| E3 | Optimistic UI + rollback | ✅ | TanStack Query `onMutate` / `onError` |
| E4 | Idempotency keys | ✅ | book, upload receipt, confirm payment, teacher booking |
| E5 | Route-based sheets | ✅ | back gesture closes sheets |
| E6 | Colour-blind-safe status | ✅ | ● ○ ◆ ✕ + words |
| E7 | Reduced motion | ✅ | animations / autoplay off |
| E8 | Apple-style UI, Phosphor icons, ivory background | ✅ | see `DESIGN-SYSTEM.md` |
| E9 | Safe areas + bottom-bar padding | ✅ | content never hidden |
| E10 | Single-file demo build | ✅ | `npm run build:proto` → `dist-proto/index.html` |
| E11 | LINE push / email delivery | 🟡 | LINE and Resend adapters implemented; credentials and provider verification pending |
| E12 | PWA install | ⬜ | P2 |
| E13 | Homework, recordings, events RSVP | ⬜ | P2 |

## F. Legal & privacy (draft — see `LEGAL.md`)

| # | Feature | Pri | Status | Acceptance criteria |
|---|---|---|---|---|
| F1 | Footer | P0 | ✅ | brand + tagline, 服務資訊 / 隱私與權益 (8 links), ©, privacy contact (【待填】) |
| F2 | 7 legal pages | P0 | 🟡 | `/legal/:slug`, versioned, draft banner, placeholders marked, lawyer questions listed |
| F3 | Sign-up consents | P0 | ✅ | terms required; media + marketing optional, unchecked; minor → guardian fields + guardian checkbox |
| F4 | Consent log + 同意設定 | P0 | ✅ | append-only records (version, time, scope); student can withdraw any time; history visible |
| F5 | Teacher sees media consent | P0 | ✅ | 學生詳細: ● 同意 / ○ 未同意 / ◆ 已撤回 + 請移除 |
| F6 | 個人資料權利申請 | P0 | ✅ | public form → 更多 → 個資權利申請 with 15/30-day due dates, handling note |
| F7 | Cookie settings | P1 | ✅ | essential always on; analytics off by default; stored with version |
| F8 | Retention job | P1 | ✅ | proposed periods, configurable |
| F9 | Teacher profile (教師個人資料) | P0 | ✅ | name, contact LINE ID + visibility, avatar, status + message, live preview, login bindings |
