/**
 * IRIS Studio legal documents (Traditional Chinese), versioned.
 *
 * STATUS: DRAFT (0.1). Written by the developer from Taiwan law texts, NOT reviewed by a Taiwan lawyer.
 * - 【待填：…】 = a business fact only Iris can give (legal name, address, contact, prices, days…). Never guessed.
 * - review[] on a section = a legal question a Taiwan lawyer must answer before this goes live.
 * The site shows both openly, so nobody mistakes the draft for a reviewed document.
 *
 * Changing a document: bump its version + updated date. If the change touches what a user agreed to
 * (terms, privacy, media, marketing), bump CONSENT_VERSION too — consent records store the version
 * the person saw, so old agreements stay provable (see ConsentRecords in SCHEMA.md).
 */

export type Block = string | string[]; // string = paragraph, string[] = bullet list
export interface LegalSection { id: string; h: string; body: Block[]; review?: string[] }
export interface LegalDoc { slug: string; title: string; version: string; updated: string; intro: string; sections: LegalSection[] }

/** version of the texts a person agrees to at sign-up / in 同意設定 (stored with every consent record) */
export const CONSENT_VERSION = '2026-11-08.v0.1-draft';

const OPERATOR = '【待填：經營者名稱（個人或公司／行號）】';
const CONTACT = '【待填：個人資料保護聯絡信箱】';

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'terms', title: '服務條款', version: '0.1（草案）', updated: '2026-11-08',
    intro: '使用 IRIS 聲樂工作室（以下稱「IRIS」）的網站與預約系統前，請先閱讀本條款。建立帳號即表示你已閱讀並同意本條款。',
    sections: [
      { id: 'who', h: '一、服務提供者', body: [
        `本服務由 ${OPERATOR} 經營（統一編號：【待填】，地址：【待填】）。`,
        `聯絡方式：${CONTACT}；LINE 官方帳號：【待填】。`,
      ] },
      { id: 'service', h: '二、服務內容', body: [
        'IRIS 提供聲樂課程，以及線上預約、改時間、取消、堂數查詢與上傳匯款證明等功能。',
        '課程形式（一對一、團體課、體驗課）、每堂時長與上課地點，以預約當時系統顯示的內容為準。',
      ], review: ['IRIS 是否須依《補習及進修教育法》立案為短期補習班？若是，應改用教育部「短期補習班補習服務契約書範本」並遵守其應記載及不得記載事項。'] },
      { id: 'account', h: '三、帳號', body: [
        '你可以用 LINE 或 Email 建立帳號；新帳號需經老師確認後才能預約。',
        '請保管好你的登入方式；若發現帳號被他人使用，請立即通知我們。',
        '請提供正確的資料。資料不正確可能導致無法聯絡你或無法提供服務。',
      ] },
      { id: 'minor', h: '四、未滿 18 歲的使用者', body: [
        '依民法，未滿 18 歲為未成年人。未成年人註冊或購買課程，應經法定代理人（父母或監護人）同意；註冊時請填寫法定代理人資料。',
        '我們會保存法定代理人的同意紀錄（版本、時間、範圍）。',
      ], review: ['未滿 7 歲（無行為能力）與 7–17 歲（限制行為能力）的處理是否需要不同流程？', '以勾選方式取得法定代理人同意是否足夠，或需書面／簽名？'] },
      { id: 'conduct', h: '五、使用規範', body: [
        ['不得冒用他人身分註冊或預約。', '不得以自動化程式大量存取本系統。', '不得上傳不實的匯款證明。'],
        '違反者，我們得暫停或終止帳號，並保留法律上的權利。',
      ] },
      { id: 'ip', h: '六、智慧財產權', body: [
        '網站內容、課程講義與教學設計之著作權，屬 IRIS 或原權利人所有，未經同意不得重製、公開傳輸或散布。',
        '上課錄音：【待 Iris 確認：學生是否可錄音、僅限個人練習，不得公開】。',
      ], review: ['學生於課程中演唱他人創作之歌曲並由 IRIS 公開時，音樂著作的授權由誰取得（詳見《肖像與影音授權》）。'] },
      { id: 'policies', h: '七、其他政策', body: [
        '預約、改時間與取消依《預約與取消政策》；付款與退費依《付款與退款政策》；個人資料依《隱私權政策》。上述政策為本條款的一部分。',
      ] },
      { id: 'change', h: '八、條款修改', body: [
        '條款修改時，我們會在網站公告新版本與生效日期；涉及你權益的重大變更，會另以 LINE 或 Email 通知。',
      ] },
      { id: 'law', h: '九、準據法與管轄', body: [
        '本條款以中華民國法律為準據法。因本條款發生爭議，雙方同意先行協商；協商不成時，以【待填：臺灣○○地方法院】為第一審管轄法院，但不排除消費者保護法第 47 條或民事訴訟法第 436 條之 9 規定之管轄。',
      ], review: ['管轄法院條款與消費者保護法之適用需律師確認。'] },
    ],
  },
  {
    slug: 'privacy', title: '隱私權政策', version: '0.1（草案）', updated: '2026-11-08',
    intro: '本政策說明 IRIS 如何蒐集、處理及利用你的個人資料，並依《個人資料保護法》第 8 條告知你應知道的事項。',
    sections: [
      { id: 'who', h: '一、蒐集者', body: [`${OPERATOR}（以下稱「我們」）。聯絡窗口：${CONTACT}。`] },
      { id: 'purpose', h: '二、蒐集目的', body: [
        ['提供課程與預約服務、管理堂數與付款（契約或類似契約關係之履行）。', '寄送與課程有關的通知（預約、改時間、取消、付款、繳費提醒）。', '客戶服務與回覆免費諮詢。', '經你另外同意時：以照片、影片或聲音進行宣傳；寄送課程活動與優惠訊息（行銷）。'],
      ], review: ['請對照個資法「特定目的及個人資料類別」代號表，填入對應之特定目的代號。'] },
      { id: 'types', h: '三、個人資料類別', body: [
        ['識別資料：姓名、Email、電話、LINE ID、LINE 登入識別碼、大頭貼。', '課程資料：聲部、學習目標、程度、預約與上課紀錄、堂數。', '付款資料：方案、金額、你上傳的匯款證明圖片與備註（我們不蒐集信用卡號）。', '未成年人之法定代理人：姓名、關係、聯絡方式。', '同意紀錄：同意項目、版本、時間、撤回紀錄。', '技術資料：登入所需的 Cookie（見《Cookie 政策》）。'],
      ] },
      { id: 'use', h: '四、利用期間、地區、對象及方式', body: [
        '期間：自蒐集時起至蒐集目的消失、你請求刪除，或依法令、契約或證據保存所需之期間屆滿為止（見下方「保存與刪除」）。',
        '地區：中華民國，以及下方第三方服務所在地區。',
        '對象：我們本人／員工，以及為提供服務必要的第三方服務商。我們不會出售你的個人資料。',
        '方式：以電子方式處理及利用，包含系統紀錄、通知寄送與備份。',
      ] },
      { id: 'third', h: '五、第三方服務', body: [
        ['LINE（LY Corporation）：LINE 登入、LINE 訊息通知。', 'Resend：寄送 Email 通知（伺服器位於美國等地）。', 'Google Fonts：網站字型由 Google 伺服器提供，載入時你的 IP 位址會傳送給 Google。', '主機與資料庫服務：【待填：主機業者名稱與資料所在地區】。'],
        '涉及國際傳輸時，我們僅提供完成該服務所必要的資料。',
      ], review: ['國際傳輸（個資法第 21 條）及委託處理之監督（個資法第 4 條、施行細則第 8 條）需確認合約與措施是否足夠。', '是否改為自行託管字型，以免將訪客 IP 傳給 Google。'] },
      { id: 'rights', h: '六、你的權利與行使方式', body: [
        '依個資法第 3 條，你可以：',
        ['查詢或請求閱覽', '請求製給複製本', '請求補充或更正', '請求停止蒐集、處理或利用', '請求刪除'],
        '請透過《個人資料權利申請》頁面提出。依個資法第 13 條，查詢、閱覽或複製本之請求，我們會在 15 日內決定；更正、補充、停止或刪除之請求，會在 30 日內決定；必要時得延長一次（分別不超過 15 日、30 日），並以書面告知原因。查詢、閱覽或製給複製本得酌收必要成本費用：【待填：是否收費與金額】。',
        '依法令、契約或證據保存義務仍需保留的資料，我們可能無法立即刪除，並會告知你原因。',
      ] },
      { id: 'optional', h: '七、不提供資料的影響', body: [
        '姓名與至少一種聯絡方式（Email 或 LINE）為提供服務所必要；不提供將無法建立帳號與預約。',
        '肖像影音宣傳與行銷訊息為「選擇性」同意，預設不勾選。不同意或日後撤回，都不影響你上課的權益。',
      ] },
      { id: 'security', h: '八、安全維護措施', body: [
        ['全站使用 HTTPS 加密傳輸。', '密碼以 PBKDF2 雜湊後儲存（ASP.NET Core 預設演算法），我們看不到你的密碼。', '登入使用 HttpOnly、SameSite Cookie；登入與表單設有頻率限制。', '依角色控管存取：學生只能看到自己的資料；匯款證明僅限上傳者本人與老師檢視。', '資料庫與檔案備份的加密及存放：【待填：主機業者的靜態加密設定】。'],
        '若發生個人資料被竊取、洩漏、竄改或其他侵害，我們會查明後以適當方式通知你，並依法通報主管機關。',
      ], review: ['2025 年 11 月公布之個資法修正（施行日期待行政院定之）新增事故通報義務；施行後需更新本段與內部事故處理流程。', '是否需訂定「個人資料檔案安全維護計畫」（個資法第 27 條）。'] },
      { id: 'retention', h: '九、保存與刪除', body: [
        ['帳號與課程資料：帳號存續期間；你刪除帳號後【待填：X 個月】內刪除或去識別化，但法令要求保存者除外。', '付款與匯款證明：【待填：依稅法及會計需要保存之年限】。', '免費諮詢表單：預設 12 個月後自動刪除【待確認】。', '同意與撤回紀錄、個資權利申請紀錄：作為證明，保存【待填：X 年】。', '系統技術紀錄（防重複送出）：24 小時後自動刪除。'],
      ], review: ['各類資料的法定保存年限（例如稅捐稽徵法、商業會計法）需確認。'] },
      { id: 'marketing', h: '十、行銷', body: [
        '我們只會在你另外勾選同意後寄送行銷訊息。你可以隨時在「個人資料 → 同意設定」關閉，或透過《個人資料權利申請》表示拒絕；收到拒絕後，我們會停止以行銷目的利用你的資料（個資法第 20 條）。',
      ] },
      { id: 'minor', h: '十一、未成年人', body: ['未滿 18 歲的使用者，請由法定代理人閱讀本政策並同意後再註冊。'] },
      { id: 'change', h: '十二、政策修改', body: ['本政策修改時，我們會公告新版本與生效日期；需要重新取得同意的變更，會請你再次確認。'] },
    ],
  },
  {
    slug: 'cookies', title: 'Cookie 政策', version: '0.1（草案）', updated: '2026-11-08',
    intro: 'Cookie 是網站存放在你瀏覽器裡的小檔案。本頁說明 IRIS 使用哪些 Cookie 與類似技術，以及你可以怎麼選擇。',
    sections: [
      { id: 'essential', h: '一、必要 Cookie（無法關閉）', body: [
        ['登入狀態 Cookie（HttpOnly）：讓你登入後不必每頁重新登入，有效期最長 30 天，登出即刪除。', 'LINE 登入過程中的暫時 Cookie：防止偽造登入請求，完成登入後失效。', '你的 Cookie 選擇本身：儲存在瀏覽器的 localStorage，記住你在下方的設定。'],
        '這些是提供服務所必需的，不用於追蹤或廣告。',
      ] },
      { id: 'optional', h: '二、非必要 Cookie（預設關閉）', body: [
        '目前 IRIS 沒有使用任何分析或廣告 Cookie。',
        '若日後加入（例如流量分析），只有在你於下方開啟後才會啟用，並會在本頁列出服務名稱與用途。',
      ] },
      { id: 'third', h: '三、第三方資源', body: ['網站字型由 Google Fonts 提供。載入字型時，Google 會收到你的 IP 位址；這不是我們設定的 Cookie，但會傳送資料給第三方。'],
        review: ['改為自行託管字型可免除此項，建議上線前處理。'] },
      { id: 'how', h: '四、如何管理', body: ['你可以在下方隨時變更設定，也可以在瀏覽器設定中刪除或封鎖 Cookie；封鎖必要 Cookie 將無法登入。'] },
    ],
  },
  {
    slug: 'media', title: '肖像與影音授權', version: '0.1（草案）', updated: '2026-11-08',
    intro: '上課或活動時，我們有時想拍下照片、影片或錄下歌聲，用來介紹 IRIS。這需要你另外、單獨的同意，預設為「不同意」。',
    sections: [
      { id: 'scope', h: '一、授權範圍', body: [
        ['素材：你在課程或活動中被拍攝的照片、影片，以及錄下的聲音（含演唱）。', '用途：IRIS 官網、社群媒體與 LINE 官方帳號【待填：實際使用的平台】、課程宣傳品。', '不包含：出售或授權給第三方作商業使用；用於與 IRIS 無關的廣告。'],
      ] },
      { id: 'basis', h: '二、為什麼需要同意', body: [
        '你的肖像與聲音受民法人格權（肖像權）保護，可識別你的影像與聲音也屬個人資料；你的演唱另受著作權法對表演人的保護。因此在公開使用前，我們必須先取得你的同意。',
        '這項同意與上課無關：不同意，不影響你預約與上課。',
      ], review: ['公開學生演唱他人歌曲之影片，需另取得音樂著作（詞曲）之公開傳輸授權，或確認平台授權範圍。', '授權是否無償、可否附條件（例如只用背影、不標示姓名），需與 Iris 確認並寫入選項。'] },
      { id: 'minor', h: '三、未成年人', body: ['未滿 18 歲者，須由法定代理人同意；法定代理人亦可隨時撤回。'] },
      { id: 'withdraw', h: '四、撤回', body: [
        '你可以隨時在「個人資料 → 同意設定」撤回，或透過《個人資料權利申請》提出。',
        ['撤回後，我們不再新增使用你的素材。', '已公開於我們可控制之網站或社群的內容，會在【待填：X】個工作天內移除。', '已印製發送的實體宣傳品、或他人已轉載的內容，我們會盡力處理，但可能無法全部收回。'],
      ] },
      { id: 'record', h: '五、同意紀錄', body: ['我們會保存你同意或撤回的時間、版本與範圍，作為日後確認的依據。'] },
    ],
  },
  {
    slug: 'booking', title: '預約與取消政策', version: '0.1（草案）', updated: '2026-11-08',
    intro: '以下是目前系統實際執行的預約規則。',
    sections: [
      { id: 'book', h: '一、預約', body: [
        ['預約需有剩餘堂數，每預約一堂扣 1 堂。', '可預約的時段由老師設定（每週時段、特殊日期、每堂時長、課程間隔、可提前預約天數）。', '同一時段只能有一位學生預約。'],
      ] },
      { id: 'cancel', h: '二、學生取消', body: [
        ['上課前 24 小時以上取消：堂數退回。', '上課前 24 小時內取消：堂數不退回。', '取消後 30 秒內可按「復原」恢復（該時段仍空著時）。'],
      ], review: ['24 小時內取消不退堂數之約定，於定型化契約中是否合理（消費者保護法第 12 條）。'] },
      { id: 'move', h: '三、改時間', body: [
        ['上課前 12 小時以上可申請改時間；老師同意後才會改，原時段在此之前保留。', '老師也可以提議新時間，必須經你同意才會改；你可以回覆「不方便」，課程維持原時間。'],
      ] },
      { id: 'teacher', h: '四、老師取消', body: ['老師取消課程時，堂數一律退回，並會通知你。'] },
      { id: 'attend', h: '五、出席', body: ['課程時間結束且未取消的課，系統會自動記為「已上課」。若有爭議，請在【待填：X】日內聯絡我們。'] },
      { id: 'late', h: '六、遲到與缺席', body: ['【待 Iris 決定：遲到是否順延下課時間、未到課是否扣堂】。'] },
    ],
  },
  {
    slug: 'payment', title: '付款與退款政策', version: '0.1（草案）', updated: '2026-11-08',
    intro: '目前付款方式為銀行轉帳，再於系統上傳匯款證明。',
    sections: [
      { id: 'pay', h: '一、付款', body: [
        ['方案與價格以「堂數與付款」頁面顯示為準（目前：4 堂、8 堂，以及只限體驗學生購買一次的體驗課；體驗課價格【待 Iris 確認】）。', '轉帳後上傳匯款證明；老師核對收據後，堂數才會加入你的帳號。', '同一時間只能有一張收據等待確認；堂數可隨時購買，會加在剩餘堂數上。', '堂數沒有使用期限。'],
        '收據／發票：【待填：是否開立統一發票或收據】。',
      ], review: ['是否須開立統一發票或依《短期補習班設立及管理準則》第 23 條掣給載明退費規定之收據。'] },
      { id: 'withdraw7', h: '二、七日內解除', body: [
        '透過網站購買課程方案，屬消費者保護法所稱之通訊交易。依同法第 19 條，消費者得於接受服務後七日內，以書面通知解除契約，無須說明理由及負擔任何費用；本服務目前未主張任何排除適用之例外。',
        '草案做法：購買後七日內提出，我們退還全額；若期間內已上過課，【待律師確認：已上課部分之計算方式】。',
      ], review: ['線上預約之實體課程是否適用消保法第 19 條七日解除權、起算點（「接受服務後」）及已上課部分之處理。'] },
      { id: 'refund', h: '三、退還未使用的堂數', body: [
        '【待 Iris 決定】是否可退還未使用堂數之費用，以及計算方式。',
        '參考：若 IRIS 屬立案之短期補習班，《短期補習班設立及管理準則》第 24 條規定：開課前申請退還 90%；開課後未達全期三分之一退還 50%；達三分之一以上得不退還（各縣市自治法規可能更有利於消費者，從其規定）。',
        '退款方式：轉帳至你指定的帳戶，於確認後【待填：X】個工作天內完成。',
      ], review: ['以「堂數」計價之方案如何對應「全期／總課程時數三分之一」之計算。', '若 IRIS 非立案補習班，適用之退費標準與定型化契約審閱期。'] },
      { id: 'reject', h: '四、收據被退回', body: ['收據無法核對時（金額不符、看不清楚等），老師會退回並說明原因，你可以重新上傳。'] },
      { id: 'teacher', h: '五、老師因故無法上課', body: ['老師取消的課程，堂數一律退回；若長期無法提供課程，未使用堂數之費用將全額退還。'] },
    ],
  },
  {
    slug: 'privacy-request', title: '個人資料權利申請', version: '0.1（草案）', updated: '2026-11-08',
    intro: '依《個人資料保護法》第 3 條，你可以查詢、閱覽、取得複製本、補充或更正、請求停止蒐集處理利用，或請求刪除你的個人資料，也可以撤回宣傳或行銷同意。這些權利不得預先拋棄或以特約限制。',
    sections: [
      { id: 'how', h: '處理方式', body: [
        ['送出後，我們會以你填寫的聯絡方式確認你的身分（例如請你從註冊的 Email 或 LINE 回覆）。', '查詢、閱覽、複製本：15 日內決定；更正、補充、停止、刪除：30 日內決定。必要時得延長一次，並以書面告知原因。', '查詢、閱覽或製給複製本得酌收必要成本費用：【待填】。'],
        `也可以直接寫信到：${CONTACT}。`,
      ], review: ['身分驗證方式是否足夠（避免他人冒名取得資料）。'] },
    ],
  },
];

export const legalDoc = (slug?: string) => LEGAL_DOCS.find((d) => d.slug === slug);

/** footer: two groups, like the reference */
export const FOOTER_LINKS = {
  service: [
    { to: '/legal/terms', label: '服務條款' },
    { to: '/legal/booking', label: '預約與取消政策' },
    { to: '/legal/payment', label: '付款與退款政策' },
    { to: '/consult', label: '聯絡我們' },
  ],
  privacy: [
    { to: '/legal/privacy', label: '隱私權政策' },
    { to: '/legal/cookies', label: 'Cookie 政策' },
    { to: '/legal/media', label: '肖像與影音授權' },
    { to: '/legal/privacy-request', label: '個人資料權利申請' },
  ],
};

/** optional consents shown at sign-up and in 同意設定 — exact wording is part of what the version proves */
export const CONSENT_TEXT = {
  media: '我同意 IRIS 在課程或活動中拍攝我的照片、影片並錄下聲音，用於 IRIS 官網、社群與宣傳品（詳見《肖像與影音授權》）。可隨時撤回。',
  marketing: '我同意接收 IRIS 課程活動與優惠訊息（LINE 或 Email）。可隨時取消。',
  terms: '我已閱讀並同意《服務條款》，並已閱讀《隱私權政策》中的個人資料告知事項。',
  guardian: '我是上述未成年人的法定代理人，已閱讀《服務條款》與《隱私權政策》，同意其註冊與使用本服務；上方選擇性同意亦由我代為決定。',
};

/* ---------- cookie preferences (non-essential stay OFF until switched on) ---------- */
export const COOKIE_PREFS_KEY = 'iris-cookie-prefs';
export interface CookiePrefs { version: string; analytics: boolean; savedAt: string }
export function readCookiePrefs(): CookiePrefs | null {
  try { const v = localStorage.getItem(COOKIE_PREFS_KEY); return v ? (JSON.parse(v) as CookiePrefs) : null; } catch { return null; }
}
export function saveCookiePrefs(p: Omit<CookiePrefs, 'savedAt' | 'version'>) {
  const v: CookiePrefs = { ...p, version: LEGAL_DOCS.find((d) => d.slug === 'cookies')!.version, savedAt: new Date().toISOString() };
  try { localStorage.setItem(COOKIE_PREFS_KEY, JSON.stringify(v)); } catch { /* storage blocked: nothing optional runs anyway */ }
  return v;
}
/** gate for any future non-essential script: call before loading it */
export const allowsAnalytics = () => readCookiePrefs()?.analytics === true;
