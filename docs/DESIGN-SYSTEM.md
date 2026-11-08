# Iris Studio — Design System

Version 3 · 8 Nov 2026 · written from the prototype (`client/src/styles.css`, `components/`).
Replaces *Design Guidebook v2*. Look: **warm ivory + botanical sage, Apple (HIG) feel** — calm, handcrafted, premium; never a generic admin dashboard.

> **How to use this doc.** Each value has a token name. New code uses the tokens, not raw hex. Some prototype blocks still have hex values written inline (they were tuned comment by comment); the table in §2 lists the value each one should become, so they can be folded into tokens in one clean-up pass.

---

## 1. Principles

1. **One thing first.** Every screen answers one question first (*When is my next lesson? What must Iris do today?*). That element gets the size; everything else is quieter.
2. **Exceptions speak, normal stays quiet.** A healthy student has no badge; 快用完 / 用完 / 確認中 do.
3. **Never only colour.** Status = colour **+ shape + word** (● ○ ◆ ✕), for colour-blind users.
4. **Every decision can be undone.** Actions apply at once (optimistic) and show a toast with 復原; the student's notification waits 10 s.
5. **Context at the moment it matters.** Policies (refund, notification timing) appear inside the confirm sheet, not as permanent fine print.
6. **Thumb first.** Mobile is the main device: 44 px targets, bottom sheets, bottom bar, content never under the bar.

---

## 2. Colour

### 2.1 Surfaces
| Token | Value | Use |
|---|---|---|
| `--ivory` | `#FFFCF5` | Page background (putih gading) — every page |
| `--ivory-deep` | `#F6F1E6` | Placeholders, info boxes, final CTA band, receipt backdrop |
| `--card` | `#FFFFFF` | Cards, sheets, modal, inputs |
| `--line` | `#ECE7DF` | Card borders, hairlines |
| `--line-soft` | `#F1EDE6` | Row separators inside cards |
| frosted | `rgba(255,255,255,.72)` + `blur(20px) saturate(180%)` | Bottom bar, sidebar, landing navbar, toast |

### 2.2 Text
| Token | Value | Contrast on ivory | Use |
|---|---|---|---|
| `--ink` | `#203129` | 13.4 : 1 | Titles, body, numbers |
| `--ink-2` | `#3A4740` | 9.5 : 1 | Long body text |
| `--muted` | `#5F6A63` | 5.5 : 1 | Secondary text, captions, meta |
| `--muted-2` | `#68716B` | 4.9 : 1 | Old time, reasons (minimum for small text) |
| `--disabled` | `#9AA09A` | — | Disabled only (exempt from contrast) |

### 2.3 Sage (brand + action)
| Token | Value | Use |
|---|---|---|
| `--sage-fill` | `#5F7564` | **Filled buttons**, selected chip, active switch, progress (white text 5.0 : 1) |
| `--sage-fill-hover` | `#536857` | Hover / pressed |
| `--sage` | `#667D6B` | Focus ring, arrows, icons (**not** for white text: 4.46 : 1) |
| `--sage-text` | `#4E6353` | Sage-coloured text links, overlines |
| `--sage-deep` | `#2F4536` | Text on sage tints |
| `--sage-tint` | `#E4EADF` | Chips, avatar tone, 2 天後上課 pill, selected date |
| `--sage-wash` | `#EEF1EA` | Highlighted row (下一堂) |

### 2.4 Status
| Meaning | Text / mark | Tint | Shape | Examples |
|---|---|---|---|---|
| OK / available | `#2F6B43` (`#4F7A5B` large) | `#E4EADF` | ● filled circle | 已確認, 新時段可用 |
| Upcoming | `#3F5A47` | — | ● | 即將上課, 已預約 |
| Done / past | `#5A615B` | — | ○ ring | 已上課, 已結束 |
| Waiting / low | `#8F6B1F` (mark `#A86E00`) | `#F7EFE3` | ◆ diamond | 等待老師回覆, 快用完, 改時間中 |
| Problem / destructive | `#B34A3C` | `#F6ECE6` | ✕ cross | 用完, 已退回, 取消, 婉拒 |
| Pending (people) | `#826A3C` | — | ● | 確認中, 收據待確認 |
| LINE brand | `#06C755` | — | — | Only the small LINE mark inside buttons |

Avatar tones (deterministic from the user id): `#DDE4DC` · `#E5DFD2` · `#D9E1DE` · `#E4DDD8`, initial in `#3F5446`.

**Rules:** no pure black text; white only on sage fill; no bright red — destructive is muted brick; every status keeps its shape and its word.

---

## 3. Typography

Font stack (system, Apple-first):
```
--font:         -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Helvetica Neue', 'Noto Sans TC', system-ui, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang TC', 'Helvetica Neue', 'Noto Sans TC', system-ui, sans-serif;
```
SF for Latin + digits, PingFang TC for Chinese; Noto Sans TC (Google Fonts) only as a fallback for non-Apple devices. Digits that line up (times, money, counts) use `font-variant-numeric: tabular-nums`.

| Role | Size / line | Weight | Notes |
|---|---|---|---|
| Large title (`.h1`) | 32/40 phone · 32/40 desktop | 700 | letter-spacing −0.022em (page titles) |
| Landing hero | 34/42 phone · 46/56 desktop | 700 | |
| Title 2 (`.h2`) | 20/28 phone · 24/32 desktop | 600 | |
| Section title | 18–19 / 26 | 600 | card titles (每週可預約時間) |
| Hero number | 21–28 / 28–34 | 600 | 下一堂 time, 剩餘 5 堂 |
| Name in lists | 16–18 / 22–26 | 600 | 17 in 學生 list, 18 in 申請 |
| Body | 15–16 / 22–24 | 400 | |
| Secondary | 14–14.5 / 20–22 | 400 | meta, reasons |
| Caption | 13–13.5 / 18–20 | 400–500 | hints, legends |
| Overline | 12–13 / 16 | 600 | letter-spacing .06em, sage-text or muted |
| Testimonial | 20/34 phone · 24/40 desktop | 500 | |

**Copy conventions:** UI in Traditional Chinese (台灣). Dates `MM-DD(週)` with half-width parentheses and a space before the time: `11-05(四) 16:30`. Duration `1 個小時` (multiples of 60) else `90 分鐘`. Student quotes in 「」. One label set for lesson types **and** student class types: 一對一 / 團體課 / 體驗課 (`CLASS_TYPE_LABEL = LESSON_TYPE_LABEL`).

---

## 4. Spacing, radius, elevation

**Spacing (4-pt grid)** `--s1 4` · `--s2 8` · `--s3 12` · `--s4 16` · `--s5 24` · `--s6 32` · `--s7 48`
- Between cards: 12. Inside cards: 16 (18 for hero cards). Section rhythm: 16 / 24 / 32. Landing sections: 56 phone / 80 desktop.

**Radius** 8 small controls · 10–12 buttons, inputs, chips · 14–16 cards · 18–22 sheets, modal, login card · 999 pills, dots.

**Elevation** (warm, low):
| Level | Shadow | Use |
|---|---|---|
| 0 | hairline `0 0 0 .5px rgba(60,52,40,.08)` | lists, flat cards |
| 1 | `0 1px 2px rgba(40,36,30,.04), 0 6px 20px -12px rgba(40,36,30,.10)` | cards |
| 2 | `0 8px 28px -10px rgba(40,36,30,.16)` | bottom bar, sidebar, toasts |
| 3 | `0 30px 80px -20px rgba(0,0,0,.45)` | modal |

Backdrops: sheet `rgba(20,22,20,.32)`; modal `rgba(12,14,12,.62)` + `blur(6px)`.

---

## 5. Layout

| | Phone (< 900 px) | Desktop (≥ 900 px) |
|---|---|---|
| Navigation | Frosted floating bottom bar, 68 px, 5 tabs (student and teacher: 首頁 / 行事曆 / 學生 / 收件匣 / 更多); active = sage tint + **filled icon**; grouped tabs stay active on member pages; teacher 收件匣 badge = amber count pill, student 通知 = dot | Frosted sidebar 240 px with the same 5 items; ⌘K search |
| Content width | full, 16–20 px side padding | max 720 px for task pages, 960–1080 for dashboards & landing |
| Bottom padding | `bnav height + 8 + 24 + safe-area` (+64 when a floating CTA is shown) | 48 px |

Safe areas: `env(safe-area-inset-*)` on bars and sheets.

---

## 6. Motion

| Token | Value | Use |
|---|---|---|
| ease-spring | `cubic-bezier(.3,.7,.4,1)` | press, switch, cards |
| press | `scale(.97)` 120 ms | every button / chip |
| enter | 200–350 ms fade + 8–12 px rise | sheets, modal, cards |
| lyric reveal | per character 550 ms, 26 ms stagger, blur 5 → 0 | testimonials |
| autoplay | 7 s per slide, pauses on hover / focus / touch, ⏸ button | testimonials only |

`prefers-reduced-motion: reduce` → no press scale, no stagger, no autoplay, no parallax glow; content changes instantly.

---

## 7. Icons

**Phosphor Icons** (`@phosphor-icons/react`), weight `regular` by default; `fill` for the active tab; `bold` for tiny ✓ marks. Sizes 16 / 18 / 20 / 22 (nav). Always through `<Icon name="…" />` (`components/Icon.tsx`) — the name → glyph map lives in one place.

| name | Phosphor | | name | Phosphor |
|---|---|---|---|---|
| home | House | | calendar | CalendarBlank |
| book | CalendarPlus | | clock | Clock |
| bell | Bell | | users / user | Users / User |
| inbox | Tray | | receipt | Receipt |
| msg | ChatCircleDots | | repeat | Repeat |
| check / x | Check / X | | plus / minus | Plus / Minus |
| chev / back | CaretRight / CaretLeft | | more | DotsThree |
| trash | Trash | | gear | GearSix |
| image | Image | | upload | UploadSimple |
| search | MagnifyingGlass | | info | Info |
| eye / eyeOff | Eye / EyeSlash | | logout | SignOut |
| mic / music / star | Microphone / MusicNotes / Star | | play / pause | Play / Pause |

Icon-only buttons always have an `aria-label`.

---

## 8. Components

Heights: buttons 44–52, inputs 46–52, chips 40–44, tabs 48. All tap targets ≥ 44 × 44.

### 8.1 Buttons
| Variant | Look | Use |
|---|---|---|
| Primary | sage fill, white text, radius 12, 600 | one per screen area: 確認預約, 預約課程, 同意 |
| Secondary | white, 1 px warm border | 改時間, 使用 Email 登入, 取消 in sheets |
| Destructive outline | white, brick text, pale brick border | 婉拒, 退回 |
| Destructive text | brick text, no box (44 px target) | 取消預約, 取消 (calendar) |
| Text link | sage-text, underline on hover | 查看完整行事曆 →, 先看收據 |
| Icon button | 44 px circle, hairline | back, close, ••• |
| Disabled | transparent, `#AAB3A8` text, light border | with the reason shown next to it |

Primary + destructive pairs are **asymmetric**: primary wider (flex 1.4–1.6).

### 8.2 Form controls
- **Input**: white, `rgba(60,52,40,.16)` border, radius 12, focus = sage border + 4 px sage glow. Label above (14 / 600). Error text below, `aria-invalid` + `aria-describedby`.
- **Password**: eye toggle inside (44 px), hint 至少 8 個字元 turns green ✓.
- **Select**: native `<select>` (best on phones), same box as input.
- **Switch (iOS)**: 46 × 28, thumb 24, off `rgba(120,120,128,.22)`, on sage fill; 44 px hit area.
- **Segmented control (iOS)**: grey track `rgba(118,118,128,.12)`, white raised thumb; used for tabs like 改時間 / 新學生, LINE / Email.
- **Chips**: pill 40–44 px. Filter chip active = sage fill. Choice chip (radio) active = sage tint + sage border. Rows scroll sideways instead of wrapping.
- **Date strip**: 60 × 80 day tiles; selected = sage tint + 2 px sage border; 休息 / 額滿 / 已過 / 未開放 = dashed, faded, not clickable.
- **Time chips**: grid; free = white; selected = **sage fill** + ring; full = flat grey, struck.

### 8.3 Containers
- **Card**: white, radius 16, hairline + level-1 shadow, padding 16–18.
- **Grouped list**: rows inside one card, 1 px `--line-soft` separators, row ≥ 56 px.
- **Bottom sheet** (Vaul): radius 22, grabber 36 × 5, title + close, swipe down / back button closes; route-based so the phone back gesture works.
- **Modal** (`<dialog>`): centred, dimmed + blurred page, focus trapped, Esc / backdrop / ✕ close — used for the receipt viewer.
- **Toast**: frosted capsule above the bottom bar; ✓ or ✕ icon; optional 復原 (5 s visible, 30 s server window).

### 8.4 Data display
- **Status mark**: `● word` with shape per §2.4 (`<Tag tone>`).
- **DateBox**: calendar tile — month band on top (`11月`), big day number; muted when past.
- **Avatar**: initial (Latin → first letter, Chinese → last character), 36 / 46 / 56 px, tone from id.
- **Quota boxes**: 40 px squares, 4 per row; ✓ filled = attended, ● tint = booked, ○ outline = free; legend underneath.
- **Counter card (KPI)**: label, big number, `● 待處理` status, chevron.
- **Lesson row**: time column (17–19 / 600, sage) + name + meta + status; finished rows muted and grouped under 已結束.
- **Request card**: name → old time (muted) → **new time** → 「reason」 → status → actions (婉拒 · 同意; decline sheet also offers 婉拒並提議其他時間).
- **Proposal card** (student home, top): amber 4 px inner edge + ivory-warm fill `#FFFBF0`, overline with ↻ icon 老師想調整上課時間, old time struck through → **new time 18/600**, 老師：「message」, one-line consequence, buttons 不方便 (secondary) · 可以，改到這個時間 (primary, 1.6× wider). The only card on home that waits for the student.
- **Proposal row** (teacher 申請 → 你的提議): name, old → **new**, status ◆ 等待學生回覆 (amber) / ● 學生已接受 / ✕ 學生不方便, action 收回 or 再提議.

- **今日待辦 card** (teacher home, 2×2): icon + title 14.5, number 28/600, one-line detail 13; > 0 → 3 px amber inner edge + `◆ 待處理` pill; 0 → grey number, no mark.
- **Lessons container** (學生詳細): one off-white `#FFFEFB` block, radius 22, padding 22 × 20, parts split by dashed hairlines; 下一堂 on sage wash `#EFF3EC` radius 16 with one pill action; rows = time 17/600 + one status line; no date tiles, no nested cards.
- **Teacher status card** (`TeacherStatusCard`, shared by student home and the 教師個人資料 preview): avatar 48, name, `● 正常上課` / `◆ status`, message, LINE ID if public; warm fill when not normal.
- **Consent checkbox** (`.au-ck`): 20 px native checkbox, sage accent, text 14.5/22; required ones end with （必填）; optional group under 以下為選擇性同意.
- **Legal page**: max 760, crumb chips for all documents, draft banner (amber), TOC card, body 16/27, `mark.lg-todo` for 【待填】, dashed review box at the end.
- **Footer**: no card — same ivory as the page, max 65rem, top hairline, brand + tagline, two link columns (40 px rows), © + privacy contact.

### 8.5 Navigation
Page head (large title, optional overline + back + right action) · tabs with 3 px sage underline · bottom bar · sidebar · ⌘K command menu · breadcrumbs not used.

### 8.6 Landing-only
Frosted navbar 56 px · hero text + 4:3 photo · trust strip (3 columns, hairlines) · benefit swipe row (82 % cards, snap, dots) · lyric testimonial stage · event gallery (1 + 2 + more) · final CTA band on ivory-deep.

---

## 9. Patterns

| Pattern | Rule |
|---|---|
| Optimistic + undo | Apply now, toast with 復原, roll back on error with an error toast |
| Delayed notify | Student alerts wait 10 s (`SendAfterUtc`) so undo leaves no trace |
| Confirm sheets | Show the consequence (refund? who is notified, when?) before the destructive button |
| Disabled with reason | Never a silent disabled button: 新時段已被預約 / 此時段已有其他預約… next to it; 改時間 < 12 h shows 上課前 12 小時內不能改 in the menu |
| Consent before change | Iris never changes a student's lesson silently: she proposes, the student answers; the sheet says 目前時段（保留到學生同意） |
| Empty states | One sentence + the next action (還沒有預約的課。 + 預約課程) |
| Loading | Skeleton blocks shaped like the content; no spinners on pages |
| Idempotency | Money / credit actions send an `Idempotency-Key`; double taps act once |
| Reminders | 24 h repeat warning before sending another 繳費提醒; the automatic one respects the same 24 h |
| Review before money | Credits are added only from inside the receipt viewer, after ticking 我已核對 |
| Optional means unchecked | Consents for media / marketing start off and never block the main task |
| Draft is visible | Unverified text is marked (【待填】, draft banner), never styled as final |

---

## 10. Accessibility checklist

- Contrast AA (4.5 : 1 text, 3 : 1 large text & marks) — axe passes on all main screens.
- Colour never alone: shapes + words for status; filled icon for active tab.
- Focus ring: 2 px sage `#667D6B`, offset 2.
- Screen-reader names match visible text (`label-content-name-mismatch` clean); sr-only month for date tiles.
- Moving content > 5 s has pause; reduced motion respected.
- Modal / sheet: focus moves in and is trapped; Esc and back close it.
