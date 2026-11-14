# IRIS Studio — UI/UX Sync Spec (source of truth: `iris-studio-demo.html`)

> **Version:** 2026-11-14 · matches demo build `1794640730-ec40` and commit `f56ae4f` (`feat/teacher-workspace-legal`)
> **Purpose:** bring any other build of IRIS Studio (design file, second front-end, native app…) in line with the demo for **text, UI structure, layout, UX behaviour and flows**.
> **Language of the UI:** Traditional Chinese (zh-TW). Copy in this document is exact — copy it character for character, including full-width punctuation（，。：「」）.

---

## 0. Read this first — what to change and what NOT to change

### ✅ Sync (make it match the demo)
| Area | Meaning |
|---|---|
| **Text** | Every label, heading, button text, placeholder, empty state, toast, tooltip, error message and their exact wording/punctuation. |
| **UI structure** | Which components exist on each screen, their order, what each one contains, which element is a button / link / tab / badge. |
| **Layout** | Columns, stacking, alignment, what sits next to / under what, desktop vs phone arrangement, relative sizes (e.g. "date is the largest text in the card"). |
| **UX** | States (loading / empty / error / success / disabled), validation, confirmation steps, undo, focus & keyboard, tooltips, touch targets, accessibility labels. |
| **Flow** | Routes, what each action leads to, which sheet/modal opens, what happens after success/failure, notifications. |

### ⛔ Do NOT change (keep the target project's own)
| Keep as-is | Notes |
|---|---|
| **Colours** (backgrounds, fills, borders, badges, states) | Where this spec says *danger / success / pending / neutral / highlight*, map it to the **target's existing token for that role**. Hex values in the demo are **not** part of this sync. |
| **Font colour** | Same: "primary text", "secondary text", "muted text" are roles, not values. |
| **Button shape** | Radius, height, padding, border style, shadow of buttons stay as in the target. This spec only says *which* button style (primary / outline / text-only / danger-outline) and the text. |
| **Button motion** | Hover / press / focus animations, ripples, transitions of buttons stay as in the target. |
| **Page transitions** | Route change animations, view transitions, sheet slide-in stay as in the target. |

> **Rule of thumb:** if a change can be described only with a hex code, a radius, a duration or an easing curve — skip it. If it changes *what the user reads, sees in which place, or can do* — sync it.

---

## 1. Global conventions

### 1.1 Formats
| Thing | Format | Example |
|---|---|---|
| Upload timestamp (receipts) | `yyyy-MM-dd HH:mm 上傳`, **always Asia/Taipei**, from backend data | `2026-11-13 22:40 上傳` |
| Short date + weekday | `MM-DD(週)` | `11-14(六)` |
| Big date in before/after cards | `M/D` on line 1, `星期X · HH:mm` on line 2 | `11/21` / `星期六 · 11:00` |
| Relative time | `今天 HH:mm`, `昨天 HH:mm`, else `MM-DD` | `今天 18:56 申請` |
| Money | `NT$ ` + thousands separator, no decimals | `NT$ 6,200` |
| Lesson length | `1 個小時 · 一對一` / `· 團體課` | |
| Weekday names | `星期一…星期日` in cards; `一…日` in date chips | |

### 1.2 Interaction rules (apply everywhere)
- **Touch targets ≥ 44 × 44 px**, even when the icon is drawn smaller.
- **Every save button** shows: idle → saving (spinner/dots, disabled) → done ("Saved" feedback) → idle. A second click while saving does nothing.
- **Toasts** appear from the top. Normal: ~1.5 s. With **復原** (undo): 5 s. Kinds: success (✓), warning (!), error (✕ — text, not colour alone). After undo → toast `已復原`; if undo failed → `復原失敗，可能已超過時間。`
- **Optimistic UI** is used for reversible actions (approve/decline reschedule, return receipt, skills, growth level). **Money is not optimistic**: confirming a receipt waits for the server (see §5.6).
- **Modals** (`<dialog>`): open centred; close with ✕, Esc, click on backdrop, 取消/返回, or automatically after a successful save. Focus returns to the button that opened it. *(The demo's close animation — swell, then shrink back into the trigger while fading — is optional for the target; keep the target's own motion if it has one.)*
- **Bottom sheets** (route-based, e.g. `/requests/:id/decline`): header = title + ✕ 關閉; swipe down closes on touch devices; Esc closes on desktop.
- **Status is never colour-only**: every status pill has an icon + text, plus a hidden `狀態：` prefix for screen readers.
- **Reduced motion**: if the OS asks for it, all looping/pulsing animations stop.

### 1.3 Status vocabulary (use exactly these words)
| Where | Statuses |
|---|---|
| Reschedule cards | `可預約` · `時段衝突` · `等待回覆` · `已同意` · `已婉拒` |
| Receipts (收據審核) | `待審核` · `已確認` · `需補件` *(`已婉拒` reserved — no backend status yet)* |
| New student account | `待確認` · `已確認` · `已婉拒` |
| Lessons (timeline / history) | `已上過` / `已上課` · `上課中` · `改過時間，已上課` · `已取消（回報）` |
| Student reply to a proposal | `等待回覆` · `已接受` · `不方便` |

---

## 2. Information architecture

### 2.1 Routes
| Route | Screen | Opens as |
|---|---|---|
| `/` | Landing | page |
| `/consult` | 免費諮詢 form | page |
| `/login` `/register` `/forgot-password` `/reset-password` | auth | page |
| `/pending` | 等待 Iris 確認 | page |
| `/legal/:slug` | 法律文件 | page |
| `/app` | 學生首頁 | page |
| `/app/lessons/:id/cancel` | 取消這堂課？ | sheet over 首頁 |
| `/app/lessons/:id/move` | 申請改時間 | page |
| `/app/book` (+ `/confirm`) | 預約課程 | page (+ sheet) |
| `/app/calendar` `/app/quota` `/app/alerts` `/app/profile` | student pages | page |
| `/teacher` | 老師首頁 | page |
| `/teacher/calendar` (+ `/lessons/:id/cancel`) | 行事曆 | page (+ sheet) |
| `/teacher/students` | 學生列表 | page |
| `/teacher/students/:id` | 學生個人資料 | page; sheets: `remind` `adjust` `edit` `basics` `payments` `propose/:lessonId` |
| `/teacher/students/:id/lessons` | 學生課程 | page; sheets: `adjust` `propose/:lessonId` `history` |
| `/teacher/requests` (`?tab=reports|apps|waiting`) | 收件匣 › 申請 | page; sheets: `:id/decline`, `reports/:id/decline` |
| `/teacher/payments` | 收件匣 › 付款 | page; sheet `:id/reject` |
| `/teacher/consults` | 收件匣 › 諮詢 | page |
| `/teacher/more` (+ `/packages`) | 更多 | page (+ sheet 課程方案) |
| `/teacher/more/reels`, `/new`, `/:id` | IG Reels | page |
| `/teacher/availability` (+ `range/…`, `date/:date`) | 可預約時段 | page (+ sheets) |
| `/teacher/profile` | 教師個人資料 | page |
| `/teacher/privacy-requests` | 個資權利申請 | page |

### 2.2 Navigation
**Teacher** — desktop: left sidebar (logo, items, user at bottom with logout icon). Phone: bottom bar.
`首頁` · `行事曆` · `學生` · `收件匣` (count badge = open requests + receipts + consults) · `更多`

**Student** — desktop: left sidebar. Phone: bottom bar with `首頁` · `預約` · `行事曆`; 通知 lives as a bell top-right on 首頁; 個人資料 inside the ⋯ menu.
Sidebar labels: `首頁` · `預約課程` · `行事曆` · `通知` (dot when unread) · `個人資料`

**Count badges** (tabs and nav): a solid "alert" pill with the number, **same style on every tab, including 等學生回覆**. Screen-reader label e.g. `1 件等學生回覆`.

---

## 3. Shared components (build once, reuse)

### 3.1 Before → After comparison (`SlotCompare`, "B1 Balanced")
Used on **every** screen that shows a time change: 收件匣 改時間 / 等學生回覆 cards, 提議改時間 sheet, 婉拒 sheet, student 老師提議 card, student 申請改時間 page.

```
┌ [📅] 原定時段 ─────────┐   →   ┌ [📅] 希望改至 ─────────┐
│ 11/21                  │       │ 11/23                  │
│ 星期六 · 11:00          │       │ 星期一 · 18:30          │
│ (optional hint line)   │       │ (optional hint line)   │
└────────────────────────┘       └────────────────────────┘
```
- **Layout:** side by side with **→** when the *container* is ≥ 560 px wide; **stacked** with **↓** otherwise (phones, sheets). Decide by container width, not screen width.
- **Arrow:** plain arrow glyph, no circle behind it, no shadow.
- **Label line:** calendar icon + label. Labels by context:
  - before: `原定時段` (cards, 婉拒) · `目前時段` (提議 sheet, student pages)
  - after: `希望改至` (student asked) · `提議改至` (Iris proposed, teacher view) · `老師提議改至` (student view) · `提議時段` (提議 sheet)
- **Date line:** the largest text in the card. The characters of `M/D` are **spread to exactly the width of the weekday line** below (`11/21` ends where `星期六 · 11:00` ends). Screen readers read the plain `11/21`.
- **Hint line** (small, inside the *before* card): `保留到學生同意` (提議 sheet) · `婉拒後維持這個時段` (婉拒 sheet) · `{教室} · 老師確認前會幫你保留` (student 申請). *After* card hint on conflict: `此時段已有其他預約`.
- **Empty after card** (nothing picked yet): dashed outline, `—` as the date, `請選擇時段` as the line under it. It never disappears (no layout jump); it fills in when a slot is picked and is announced by screen readers (`aria-live`).
- **Roles (map to target colours):** before = plain surface; after = "highlight / new" surface with accent label; conflict = danger surface; declined = muted/inactive surface; approved = before-date struck through.

### 3.2 Reschedule card (`RescheduleCard`)
Order inside the card:
1. **Header:** avatar (one character of the name) · name (h4) + sub line · **status pill** top-right.
   - Sub line: `今天 18:56 申請` / `今天 17:56 傳送提議` / after decision `已改到新時段 · 會通知學生` or `維持原時段 · 會通知學生` / proposals `學生已同意，已改時間` · `學生不方便，維持原時間`.
2. **Before → after** (§3.1).
3. **Reason row:** small speech-bubble icon tucked against the top-left of the first character, then **label underlined** + `：` + **value in italics**.
   - `申請原因：那天公司臨時要加班，抱歉！` · `你的說明：那天早上我要參加研習，下午可以嗎？`
4. **Footer** (divider above): `婉拒` (danger-outline) + `同意改期` (primary). Equal width on phones, right-aligned on desktop.
- **時段衝突:** `同意改期` is **hidden**; `婉拒` stays. The explanation **`新時段已有其他預約，請學生重新選擇時段。` is not printed in the card** — it lives in a **tooltip on the 時段衝突 pill**: opens on click/tap, on keyboard focus, or after hovering **2 s**; closes on Esc, second click, click outside, mouse leave. The pill is a real button (44 px tall hit area); the tooltip text is always in the DOM and linked with `aria-describedby` (also from the 婉拒 button).
- **After a decision** the card **stays in place** with `已同意` / `已婉拒` and **no buttons** (10 min, or until the page is left); 復原 in the toast restores the open card.
- **等學生回覆 tab** uses the same card: pill `等待回覆` / `已同意` / `已婉拒`; footer `收回提議` (open) or `再提議` (declined, text/ghost style); approved → no footer.

### 3.3 Status row (`StatusRow`) — new-student cards
A soft panel row: label left (`帳號狀態`), dot + value right (`待確認` / `已確認` / `已婉拒`).
`待確認` **pulses bright ↔ dim 3 times (~5 s) then stays bright** — only for states waiting on Iris; never for `等待回覆` (waiting on the student). Off with reduced motion.

### 3.4 Receipt card — "B Financial Highlight V2" (收據審核)
1. **Header:** receipt-icon button (no tile behind it, slightly faded, full opacity on hover/focus; label `查看 {姓名} 的收據`) · name (h2) + `yyyy-MM-dd HH:mm 上傳` · status pill top-right (`待審核` / `已確認` / `需補件`).
2. **Two highlight panels side by side** (also on phones): `購買課堂` → `8 堂` (trial: `單堂課`) and `付款金額` → `NT$ 6,200`; fees add a small line `含取消費 NT$500`. Labels, values and amounts in the primary (black) text role.
3. **Note row** only when the student wrote one: `學生備註：` (screen-reader only) `「已轉帳，末五碼 12345」`.
4. **需補件 only:** warning row `退回原因：{reason}` + line `等待學生重新上傳收據` (label underlined).
5. **Footer:** `待審核` → `退回` (danger-outline link to sheet) + `審核收據 →` (primary, opens receipt). Other statuses → `查看收據` only (read-only).
- **No bottom status text** (the old `請先核對收據` is removed). No summary line above the list (the old `待審核 N 筆 · 共 NT$ …` is removed).

### 3.5 Receipt modal (`{姓名} 的收據`)
- Title `李思涵 的收據`, sub `8 堂 · NT$ 6,200 · 2026-11-14 06:56 上傳`, image of the receipt, ✕.
- Checkbox **`我已核對：金額 NT$ 6,200，和收到的匯款一致`** — required before confirming; hint while unchecked: `請先勾選核對，再加堂數給李思涵。`
- Actions: `退回` + `確認，加 8 堂`.
- **Confirm is not optimistic:** button shows spinner + `確認中…` and stays disabled; modal stays open until the server answers. Success → modal closes, card leaves 待審核, toast `已確認收據，{姓名} +8 堂` with 復原. Failure → inline alert under the button `確認失敗：{message}` (icon + text). Duplicate clicks ignored (plus idempotency key).

### 3.6 今日待辦 KPI cards (teacher home)
Section header: `今日待辦` + subtitle `需要你關注的事項` + right-aligned **plain text** summary `6 項待處理` (or `都處理好了`) — same text style as the `查看完整行事曆` link, **no pill, no arrow**.
Four cards: `學生申請` · `待確認收據` · `新學生` · `諮詢`. Each card:
- title (top-left) · **→ arrow link** (top-right, the only link; longer tail arrow) · big number + `待處理` badge · detail line (`改時間 2 · 回報 1` / `共 NT$ 9,400` / `等待你確認帳號` / `都已聯絡`).
- The card's own icon (clock / receipt / person / chat) sits **large, faded, middle-right**, decorative only (not clickable, hidden from screen readers). On phones it's smaller and sits beside the badge so it never covers text.
- Arrow link label: `前往學生申請：3 件待處理，改時間 2 · 回報 1`.

### 3.7 課堂筆記 (lesson note)
- **Entry points:** notebook icon button **before the status** of each lesson in 今天的課 **once the class has started** (and it stays), and on **every past lesson** in 行事曆. Filled icon + dot when a note exists. Label `{姓名} {時間} 的課堂筆記` (+`（已有筆記）`).
- **Dialog:** title `課堂筆記`, sub `{姓名} · {MM-DD HH:mm}`, ✕.
  - No note → radio (2 choose 1) `輸入文字` (default) | `上傳截圖`.
    - 輸入文字: toolbar `B` `I` `U` `項目清單`, editor placeholder `例如：今天練了換聲區，下次先做唇顫音暖身。`, save `儲存筆記`.
    - 上傳截圖: drop area `選擇截圖` / `JPG、PNG 或 WEBP，5 MB 以內 · 會自動轉成 WebP`; after picking: preview + `{檔名} · 1.2 MB` + `換一張`; save `上傳截圖`.
  - Has a note → preview (text or image + file name) with tag `文字筆記` / `截圖` and a 🗑 button (`刪除這份筆記，重新輸入或上傳`).
  - 🗑 clears **locally only**; hint `已從畫面移除。原本的筆記會保留到你儲存新的內容為止。` The server copy is replaced only when the new note is saved; closing the dialog keeps the old note.
- Errors (inline, icon + text): `請輸入筆記內容。` `請選擇一張截圖。` `只接受 JPG、PNG 或 WEBP 圖片。` `圖片不能超過 5 MB。` `課程開始後才能加筆記。`
- Success toast: `已儲存{姓名}的課堂筆記`.
- Backend: image → WebP (≤ 2000 px, EXIF removed), original never stored, file `yyyyMMdd_{學生姓名}_Class_Notes.webp` (2nd lesson same day: `…_Class_Notes_HHmm.webp`), bound to LessonId + StudentId. Teacher-only.

### 3.8 Comment labels
Every labelled comment (`申請原因` `你的說明` `退回原因` `老師` `學生`) has the **label underlined** (thin, same colour as the text — not link-coloured); the `：` is not underlined. Reschedule reason **values** are italic.

---

## 4. Screens

### 4.1 Landing `/`
Top nav: `聲樂教練` (logo) · `關於 Iris` · `課程內容` · `學生心得` · `活動` · `登入` · `免費諮詢` (primary).
Sections in order:
1. **Hero** — H1 `找到屬於` / `你的聲音`; lead `不是唱得更像別人，而是更自在地唱成自己。`; `向下滑動` cue.
2. **關於 Iris** — H3 `你好，我是 Iris Chen 陳文媛`; 4 paragraphs (brand list spelled **`CANON`**, all brands uppercase: `HTC、ASUS、1028、NIKON、CANON、TOYOTA、MAZDA、KOSE…`). Clear **space below the last paragraph** before the next band (≈ 88 px desktop / 64 px phone).
3. **演唱與教學經歷** — **full-bleed band across the whole viewport width on desktop** (content stays in a centred column). Lead text, link `看演出片段`, stats: `12+ 年演唱與教學經驗` · `10+ 品牌廣告配樂與配唱` · `4+ 福音音樂機構專輯錄音` · `4+ 國內外大專院校錄取輔導`.
4. **課程內容** — `Iris 可以幫你什麼`, scroll story `01 / 03` (`把基礎打穩` …).
5. **學生心得** — `學生怎麼說`, 3 quotes (陳小姐 / 林先生 / 黃媽媽) with sub lines.
6. **福音音樂與專輯錄音** — player (上一首 / 播放 / 下一首) + 4 tracks + `合作教會與機構`.
7. **教會敬拜團歌手教學、團隊訓練** — 11 churches, `共 11 間教會與機構`.
8. **精彩片段** — Reels strip (← →), `在 Instagram 看更多（另開新視窗）↗`; a tile opens the Reel player dialog.
9. **工作室活動** — event cards + `查看更多照片（4）`.
10. **CTA** — `還不確定從哪裡開始？` / `先聊聊你現在的聲音，和你想唱到哪裡。` / `免費聊 15 分鐘` / `沒有壓力，也不用先決定要不要上課。`
11. **Footer** — `Iris Vocal Studio` · `聲樂工作室` · `陪你找到自己的聲音。`; `服務資訊` (服務條款 / 預約與取消政策 / 付款與退款政策 / 聯絡我們); `隱私與權益` (隱私權政策 / Cookie 政策 / 肖像與影音授權 / 個人資料權利申請); `© 2026 IRIS Studio. All rights reserved.`

### 4.2 免費諮詢 `/consult`
H1 `先聊聊，再決定`. Fields: `名字*（必填）` (`怎麼稱呼你？`) · `聯絡方式*（必填）` segmented `LINE` | `Email` + help button `怎麼找 LINE ID？` (click, or hover 3 s → dialog with 4 steps + `知道了`) · `LINE ID` (`你的 LINE ID`) · `方便聯絡的時間*（必填）` chips `平日白天` `平日晚上` `週末` `都可以` · `想聊什麼？（選填）` (`例如：想把高音唱穩、準備婚禮獻唱`). Submit disabled text until valid: `先填寫資訊喔！`.

### 4.3 Auth
- **登入** — H1 `歡迎回來`; `Email` / `密碼` (`輸入你的密碼`); `忘記密碼？`; `登入`; `LINE 登入`; `老師登入`; `建立帳號 →`. Demo block `示範帳號`: `學生 王小明` · `新學生（等待確認）` · `老師 Iris`.
- **註冊** — H1 `建立你的帳號`; `Email*` `姓名*` (`例如：王小明`) `密碼*` (`例如：Sing2026`, `顯示密碼`) `確認密碼*`; `開始之前` with checkboxes: terms/privacy (required), 肖像與影音授權 (optional, `了解授權範圍`), marketing (optional), `我未滿 18 歲`; `建立帳號`.
- **忘記密碼** — `寄送重設連結`, `← 回到登入`.
- **Pending** — stepper `建立帳號` → `2 Iris 確認` → `3 開始預約`; `申請已送出` / `等待 Iris 確認` / `Iris 會親自確認你的帳號，通常會在 1 天內完成。確認後我們會通知你。` / `確認後，就可以購買堂數並預約第一堂課。` / `不是{姓名}？切換帳號`.

### 4.4 Student
**首頁 `/app`** — greeting `晚安，小明` + date `2026.11.14 (六)` + bell `通知，有未讀`.
1. *(when Iris proposed a change)* card `老師想調整上課時間`: before→after (`目前時段` → `老師提議改至`), `老師：「…」` (label underlined), `你同意後才會改。不方便的話，原本的時段會保留。`, buttons `不方便` | `可以，改到這個時間`.
2. `下一堂課` (`已確認`): big date, `Monday, 17:00`, `1 個小時 · 一對一`, tip `記得上課前暖暖聲，多喝溫水`, actions `改時間` · `取消預約`.
3. `我的額度`: `剩餘 5 堂`, `已上課 3` `已預約 3` `可預約 5` `已取消 1`; `預約課程` · `查看歷程記錄`.
4. `其他預約 · 2`: rows with sub status `申請改到 … / 等待老師回覆`, `老師建議改到 … / 等你回覆`, ⋯ menu.

**預約課程 `/app/book`** — `剩餘 5 堂`; `選擇日期` (14-day chip strip, states `已過` `休息` `額滿` `可預約`); `選擇時段` + `只顯示空的時段`; summary `預約明細` (`11-16(一) 15:30`, `1 個小時 · 一對一`, `預約後剩餘 4 堂 （使用 1 堂）`, `上課前 24 小時以上取消，使用的堂數將退回。`); button `確認預約` (disabled text `請選擇時段`).

**申請改時間 `/app/lessons/:id/move`** — before→after (`目前時段` with hint `{教室} · 老師確認前會幫你保留` → `希望改至`, empty until picked); date chips; `只顯示空的時段`; `請先選擇日期。`; `原因（老師會看到）` (`例如：那天要加班，想改到週末`); submit `請選擇新時段` → enabled when picked.

**取消這堂課？ (sheet)** — lesson summary `1 個小時 · 一對一 · A 教室`; `取消 11-16(一) 的課` · `保留這堂課`.

**行事曆** — tabs `月` | `列表`; month grid; day panel `這天沒有課。` + `預約這天`.

**堂數與付款 `/app/quota`** — `我的額度`; `付款紀錄` (`4 堂 · NT$ 3,200`, `10-15 上傳`, `已確認`; returned: `· 退回原因：…` with label underlined); `購買新方案` (`隨時都可以購買，老師確認後，堂數會加在目前剩餘的堂數上。`), plan radios, `匯款帳號`, upload `匯款證明（JPG、PNG、WEBP，5 MB 以內）`, `備註（選填）` (`例如：帳號末五碼`), `上傳匯款證明`.

**通知** — `全部標為已讀`, list of alerts with time.

**個人資料** — `透過 LINE 登入 · 程度 Grade 4（老師設定）`; link card `堂數與付款 · 剩餘 5 堂 · 上傳匯款證明`; fields 姓名 / 電話 / Email / LINE ID / 聲部 / 學習目標; `儲存`; `同意設定` (`以下都是選擇性同意，不同意也能正常上課。` + 2 toggles); link `個人資料權利申請`; `登出`.

### 4.5 Teacher
**首頁 `/teacher`** — date line, H1 `晚安，Iris Chen !`, quote line. Then:
1. `今日待辦` (§3.6).
2. `今天的課` + link `查看完整行事曆 →`: vertical timeline (time · name · `1 個小時 · 一對一` · status `已上過` / `上課中`), now-line; **課堂筆記 icon column before the status** (§3.7).
3. `最近付款記錄`: rows (avatar, name, class type, timestamp, `查看收據` opens receipt pop-up) + `查看所有付款記錄 ›`.

**行事曆** — H1 `行事曆` + link `可預約時段`; month grid with ‹ ›; day list `今天 · 11-14(六) · 4 堂`. Upcoming rows: `改時間` / `取消`. **Past rows: 課堂筆記 icon on the right.** Teacher **cannot book for students** (no booking button anywhere).

**學生列表** — breadcrumb `首頁`; H1 `學生`; search `搜尋學生`; segment chips `全部` `活躍 (8)` `冷漠 (1)` `未購買課程 (1)` `未上單堂課 (1)`; table columns `ID` `學生` `性別` `聲部` `上課資年 (m)` `堂課額度` `操作`; new students get an **N mark** between ID and photo; 操作 = 📖 link to 課程 + ⋯ menu (`給筆記` / `給作業` / `停用`…); 8 per page with `第一頁` `上一頁` `下一頁` `最後一頁`.

**學生個人資料 `/teacher/students/:id`** — breadcrumb `首頁 / 列表 / 個人資料`; **banner** (hover → pencil icon top-right, click = upload banner; on touch screens the pencil is always visible) and **photo with a camera badge** (click = upload photo; label `更換 {姓名} 的大頭照`); name + `一對一`, email, `LINE ID：…`; icon links 📖 課程 · LINE · 🔔 `通知 {姓名} 繳學費`; stats `最初上課` `首次購買課程` `購買總額` `學習資歷`.
Sections: `個人帳號資訊` (**no description line**) — `全名`, `登入方式`, link `編輯課程類型`; `基本資料` (**no description line**, pencil `編輯聲部與程度` top-right) — `聲部`, `程度`, `電話`. 肖像授權 line: **hidden when agreed**; shown only as a warning when not agreed (`未同意肖像影音宣傳，請勿公開照片或影片`) or withdrawn (`已撤回肖像影音授權（日期），請移除已公開的內容`). Nothing below that (課程狀態 etc. removed).
Uploads: JPG/PNG/WEBP ≤ 5 MB → WebP (photo ≤ 512 px, banner ≤ 1800 px); spinner while uploading; toasts `已更新大頭照` / `已更新封面照片`.

**學生課程 `/teacher/students/:id/lessons`** — name + `一對一 · 6 堂課`; 3-column band: `學習目標` · `技能徽章` (`＋ 新增`, removable chips, ≤ 12) · stats (`剩餘 5 堂課` + `調整`, `總堂數`, `成長等級 3 級` + info + `編輯`, `缺課`). Below, collapsible tab `課程中心` (v open / ^ closed, remembered) with two separate cards: `上課紀錄` (last 3, `Thursday, 2026-11-12 14:00` + status, → full history sheet) and `下一堂課` (`改時間` · `筆記` pills, big weekday, date, time).

**收件匣** — H1 `收件匣`; top tabs `申請 4` · `付款 2` · `諮詢`.
- *申請* sub-tabs: `改時間` · `回報` · `新學生` · `等學生回覆` (all with the same count badge).
  - 改時間: reschedule cards (§3.2).
  - 回報: card — name, `今天 13:56 回報 · 想取消已上過的課`, `課程 11-13(五) 17:00（已記為已上課）`, quote, effect `同意：退回 1 堂，下次繳費加收取消費 NT$ 500`, checkbox `這次免收取消費`, status `待審核`, `婉拒` · `同意`.
  - 新學生: card — **name → email (secondary text) → `今天 18:56 申請` (smaller than the email)**, status row `帳號狀態 待確認` (§3.3), `婉拒` · `確認`.
  - 等學生回覆: reschedule cards in proposal mode (§3.2) + `最近 7 天的回覆`.
- *付款*: tabs `待審核` · `已確認` · `需補件`; receipt cards (§3.4).
- *諮詢*: `來自網站的免費諮詢表單`; empty `目前沒有新的諮詢` / `網站上的「免費諮詢」表單送出後，會出現在這裡。`

**更多** — no logo, no H1 visible (screen-reader H1 `更多`), no lead line. Groups, each with an icon heading:
`個人資料` (ID-card icon) → card `Iris Chen · 教師個人資料 · 狀態：正常上課`;
`課程相關` → `可預約時段 每週時段、特殊日期` · `課程方案 堂數與價格，可自行調整` · `IG Reels 網站「精彩片段」的影片，最多 8 則`;
`帳號與設定` → `設定 每堂課時長、課程間隔、可提前預約`;
`支援與法律` → `個資權利申請 …` · `法律與隱私文件 …（草案）`; `登出`.

**可預約時段** — tabs `每週時段` · `特殊日期` · `預約設定`. 特殊日期: `新增特殊日期` is a **text action with a ＋ icon (no filled background)**, aligned with the text above. 預約設定: `每堂課時長` (30–120 分鐘) · `課程間隔` (`不休息`–60 分鐘) · `可提前預約` (7–90 天內); note `改了之後，學生看到的時段會馬上更新。已經預約的課不受影響。`

**課程方案 (sheet)** — rows `單堂課 / 4 堂 / 8 堂` with `NT$` prices, `新增方案`, note `儲存後學生馬上看到新價格。已上傳的收據維持原本的金額，不會受影響。`, `儲存`.

**IG Reels** — list (drag/keyboard sort `排序：{title}，目前第 N 則。用上下方向鍵移動`), `編輯` / `刪除` (confirm dialog `你確定要刪除這一則？` `返回` `刪除`), max 8.

**教師個人資料** — `學生看到的樣子` preview; `大頭貼` (`上傳照片`); `教師名稱`; `LINE ID（聯絡用）`; `目前狀態` chips `正常上課` `放假中` `暫停接新學生` `自訂` + `狀態訊息` + quick picks; `儲存`; `登入方式` (`變更` / `綁定`).

**個資權利申請** — note `請先確認申請人身分（例如請對方從註冊的 Email 或 LINE 回覆），再處理。延長期限時，需以書面告知原因。`; empty `目前沒有個資權利申請`.

### 4.6 Teacher sheets
| Sheet | Content |
|---|---|
| 婉拒{姓名}的申請 | before→after (§3.1, conflict tone if taken) · `給學生的訊息（選填）` (`例如：那天的 16:30 可以嗎？`) · `婉拒並通知學生` · `婉拒並提議其他時間` · `返回` |
| 提議改時間 · {姓名} | before→after (empty until picked) · date chips · `只顯示空的時段` · time chips · `給學生的訊息（選填）` (`例如：那天早上我有事，下午可以嗎？`) · `傳送提議給學生` · `返回` |
| 退回{姓名}的收據 | `今天 06:54 上傳` · `退回原因（學生會看到）` (`例如：金額不符，請確認轉帳金額。`) · `退回並通知學生` · `返回` |
| 調整堂數 | `增加` / `減少`, 1–4, `原因（必填）` `補課` `贈送` `修正錯誤` `其他`, `備註（選填）`, `儲存調整` |
| 編輯基本資料 · {姓名} | `聲部` / `程度` (Grade 1–8) dropdowns, `儲存`, `取消` |
| 上課紀錄 · {姓名} | full history list |

---

## 5. Flows

### 5.1 Student books a lesson
`/app/book` → pick date → pick time → `確認預約` → toast + lesson on 首頁/行事曆 → credits −1.

### 5.2 Student asks to reschedule → Iris decides
1. Student: 下一堂課 `改時間` → `/app/lessons/:id/move` → pick slot (after card fills) → reason → submit. Original slot stays booked.
2. **Iris is notified** (in-app record + email): `學生申請改期 — {姓名}：{原時段} → {新時段}`.
3. Iris: 收件匣 › 申請 › 改時間. If the new slot is taken → pill `時段衝突` (tooltip), only `婉拒`.
4. `同意改期` → spinner → card turns `已同意` (stays, no buttons) → toast `已同意改期，10 秒後通知{姓名}` with **復原**. The server re-checks the slot inside the transaction (409 `slot_taken` → card returns as 時段衝突 + error toast). Duplicate clicks are ignored.
5. `婉拒` → sheet → `婉拒並通知學生` → card `已婉拒` → toast `已婉拒，10 秒後通知{姓名}` with 復原. Or `婉拒並提議其他時間` → 提議 sheet.
6. After the 10 s undo window: student gets `老師同意改時間` / `老師無法改到這個時間`; **Iris gets a confirmation** `已同意改期` / `已婉拒改期`. Undo removes both.

### 5.3 Iris proposes a new time → student answers
Iris: 學生課程 › 下一堂課 `改時間` (or 個人資料) → 提議 sheet → `傳送提議給學生` → 等學生回覆 card `等待回覆` (`收回提議` available).
Student: 首頁 card `老師想調整上課時間` → `可以，改到這個時間` or `不方便`. Iris is notified `學生已同意改期` / `學生不方便改期`; card moves to `最近 7 天的回覆` as `已同意` / `已婉拒` (`再提議` on declined).

### 5.4 Student reports a missed class (回報)
Student reports an attended lesson → 收件匣 › 回報 → Iris `同意` (refund 1 credit, fee next payment unless `這次免收取消費`) or `婉拒` (sheet with `學生：「…」`).

### 5.5 New student account
Register → `/pending` → Iris: 收件匣 › 新學生 (`待確認` pulses) → `確認` (assigns student no. + joined date; student gets notified) or `婉拒`.

### 5.6 Payment → receipt review → credits
1. Student: 堂數與付款 → choose plan → upload proof (+ note) → `上傳匯款證明` → appears as `待審核`.
2. Iris: 收件匣 › 付款 › 待審核 → `審核收據` (or receipt icon) → modal → tick `我已核對…` → `確認，加 N 堂` → **wait for server** → success toast with 復原 → card leaves the list → credits added **only now** (server, same transaction, audit log, idempotency key, second confirm → 409).
3. Or `退回` → sheet with reason → card under `需補件` with `退回原因` + `等待學生重新上傳收據`; student sees the reason in 付款紀錄.

### 5.7 課堂筆記
Class starts (now-line reaches the dot) → notebook icon appears → dialog → text or screenshot → save → filled icon. Re-open → preview → 🗑 (local) → redo → save replaces (old file deleted server-side). Also from any past lesson in 行事曆.

### 5.8 Student photo / banner
學生個人資料 → camera badge (photo) or hover banner → pencil (banner) → file picker → upload (spinner) → replaced + toast.

---

## 6. States checklist (per screen)
| State | Required behaviour |
|---|---|
| Loading | skeleton or `載入中…`; buttons disabled while their own request runs |
| Empty | title + one helpful line (see copy above), never a blank area |
| Error | inline, near the control, **icon + text**, plus toast for background failures; retry where possible (`再試一次`) |
| Success | toast; card/badge counts update immediately; undo where the action is reversible |
| Disabled | visibly different and not clickable; explain why when not obvious (e.g. `請先勾選核對，再加堂數給…`) |

---

## 7. Accessibility checklist
- One H1 per page (visually hidden where the design has none, e.g. `更多`).
- Icon-only buttons have Chinese `aria-label`s (examples above).
- Decorative icons are hidden from screen readers (KPI big icons, speech-bubble icon, arrow between dates).
- Tooltips: `role="tooltip"` + `aria-describedby`; reachable by keyboard.
- Focus ring visible on every control; Esc closes dialogs/sheets/tooltips.
- Contrast ≥ 4.5 : 1 for text, ≥ 3 : 1 for icons that are controls (the faded receipt icon is the only known borderline case — the same action is also available via the main button).
- Reduced motion respected.

---

## 8. Deliberately NOT carried over from the demo (visual-only)
These were changed in the demo but are **colour / shape / motion only** — keep the target's own:
- Exact hex values of: milk-white "after" card, pure-white "before" card, sage accents, red count badges, pill backgrounds, status colours, KPI icon opacity numbers.
- Button radii/heights, shadows, hover/press animations.
- Page/route transition animations, sheet slide animations.
- (Optional) the modal close motion (§1.2) — adopt only if the target has no modal motion of its own.

---

## 9. Acceptance — "is it in sync?"
- [ ] Every string in §3–§4 appears verbatim on the matching screen.
- [ ] Route table §2.1 resolves to the same screens/sheets.
- [ ] Before→after appears in all 5 places and switches side-by-side ↔ stacked by container width.
- [ ] 時段衝突 explanation only in the pill tooltip; `同意改期` hidden on conflict.
- [ ] Decided reschedule cards stay with `已同意` / `已婉拒` and undo restores them.
- [ ] Receipt cards: two panels, Taipei timestamp, no bottom status, no summary line; confirm waits for the server.
- [ ] 課堂筆記 icon rules (started classes + past 行事曆), local delete semantics.
- [ ] New-student card order name → email → time; `待確認` pulses 3× only.
- [ ] Count badges identical on all four 申請 sub-tabs.
- [ ] Nothing in §0 "Do NOT change" was touched.
