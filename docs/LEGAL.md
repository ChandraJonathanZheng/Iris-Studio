# IRIS Studio — Legal & Privacy (draft 0.1, 8 Nov 2026)

**Status: DRAFT. Not reviewed by a Taiwan lawyer. Nothing here claims compliance.**
The texts live in `client/src/lib/legal.ts` (one versioned object per document) and render at `/legal/:slug`.
Every page shows a draft banner. 【待填】 = business fact only the owner can give; "◆ 上線前需律師確認" = open legal question.

## 1. Documents

| Page | Route | What it covers |
|---|---|---|
| 服務條款 | `/legal/terms` | operator, service, account, minors, conduct, IP, governing law |
| 隱私權政策 | `/legal/privacy` | PDPA §8 notice items: who, purposes, data types, period/area/recipients/method, rights, effect of not providing |
| Cookie 政策 | `/legal/cookies` | essential cookies only today; settings panel (analytics OFF by default) |
| 肖像與影音授權 | `/legal/media` | separate optional consent for photo / video / voice, withdrawal |
| 預約與取消政策 | `/legal/booking` | the rules the system enforces (24 h cancel, 12 h move, consent for Iris's proposals, auto-attend) |
| 付款與退款政策 | `/legal/payment` | transfer + receipt, buy any time, no expiry, 7-day withdrawal (消保法 §19), refund of unused credits (open) |
| 個人資料權利申請 | `/legal/privacy-request` | form for the 5 PDPA §3 rights + withdrawing consent, with the §13 deadlines (15 / 30 days) |

Law references used (checked against published texts, Nov 2026): 個資法 §3, §8, §13, §20; 消保法 §18–19 and the 通訊交易解除權合理例外情事適用準則 (exclusion only valid if the customer was told clearly); 短期補習班設立及管理準則 §23–24 (only if IRIS must register as a 補習班); 民法 adulthood at 18. The PDPA amendment promulgated 11 Nov 2025 (breach notification to the PDPC) has no effective date yet.

## 2. What the system now does

| Requirement | Implementation |
|---|---|
| Terms + privacy notice accepted at sign-up | Required checkbox (email and LINE sign-up). Server rejects sign-up without it (`consent_required`). |
| Optional, **unchecked** media consent | Separate checkbox, default off; wording = `CONSENT_TEXT.media`. Not needed to book. |
| Optional, unchecked marketing consent | Separate checkbox, default off. |
| Guardian consent for minors | "我未滿 18 歲" → guardian name, relation, contact + guardian's own checkbox (required). Later, a minor turning an optional consent ON needs guardian confirmation; withdrawing never does. |
| Record version, time, scope, withdrawal | `ConsentRecords` table, **append-only**: kind, granted, version (`CONSENT_VERSION`), scope, source, guardian fields, timestamp. Latest row per kind = current state. Student sees the full history in 我的 → 同意設定. |
| Withdrawal | 同意設定 switches (instant), or 個人資料權利申請 → 撤回同意. |
| Iris knows what she may post | 學生詳細 shows ● 同意 / ○ 未同意 / ◆ 已撤回（date）— 請移除已公開的內容, and 未成年. |
| Privacy requests reach Iris with deadlines | `PrivacyRequests` table; 更多 → 個資權利申請 lists due dates (15 d access/copy, 30 d others), overdue in red; handling note required. |
| Cookie preferences | Cookie 政策 page: essential always on; analytics switch default OFF, stored in localStorage with version + time. `allowsAnalytics()` must gate any future script. |
| Password hashing | ASP.NET Core Identity `PasswordHasher` (PBKDF2). |
| Access control | Role policies on every route; students only their own data; receipts via `/api/receipts/{id}` to owner + teacher. |
| Transport / session | HTTPS (deploy), HttpOnly + SameSite cookie, login/form rate limits. |
| Retention | `RetentionService` every 6 h: idempotency keys 24 h, consult forms 12 mo, read alerts 12 mo, handled privacy requests 3 y (`Studio:Retention`, **proposed values**). Consent, payment and lesson records are kept (proof / accounting). |

## 3. Not done yet (needs a decision or an outside service)

- Encryption at rest: depends on the host (database + receipts folder + avatars). Choose a host with disk encryption, or encrypt receipt files.
- Breach response plan + PDPC notification once the 2025 amendment takes effect.
- Account deletion flow (today: via 個人資料權利申請, handled by Iris).
- Self-host the Google Font (stops sending visitors' IP to Google).
- Verification email for changed login email (Resend not connected).

## 4. Owner (Iris) must fill in

Legal name / 統一編號 / address · privacy contact email · LINE OA ID · host + data location · 體驗課 price · refund of unused credits · late / no-show rule · whether students may record lessons · media takedown time · retention periods · receipt / invoice practice · competent court.

## 5. Questions for the lawyer

1. Must IRIS register as a 短期補習班? If yes, switch to the MOE contract template and its refund rules.
2. Does 消保法 §19 seven-day withdrawal apply to online-bought in-person lessons; start date; partly used packages.
3. Is "no refund for cancellation < 24 h" fair under 消保法 §12; mapping credit packages to "1/3 of the course".
4. Minors: is a checkbox enough for guardian consent; different handling under 7 / 7–17.
5. Media consent: free of charge, granularity (no name, back only), takedown time; music copyright for published covers.
6. Cross-border transfer and vendor contracts (LINE, Resend, host); need for a 安全維護計畫 (§27).
7. Statutory retention for payment records; governing-court clause.
8. Specific-purpose codes (特定目的代號) for the privacy notice.
