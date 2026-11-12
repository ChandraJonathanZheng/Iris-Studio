import { useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { newIdempotencyKey } from '../lib/api';
import { addDays, CLASS_TYPE_LABEL, fmtDuration, fmtMoney, fmtRelative, fmtSlot, initialOf, LESSON_TYPE_LABEL, studioToday } from '../lib/date';
import {
  useAdjustCredits, useDays, useProposals, useSendReminder, useSetClassType, useSetConsultationCompleted, useStudent, useStudents, useStudio, useTeacherBook,
} from '../lib/queries';
import type { ClassType, Lesson, PaymentStatus, StudentDetail, StudentSummary } from '../lib/types';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { SlotPicker } from '../components/SlotPicker';
import { useToast } from '../components/Toast';
import { ErrorCard, ListSkeleton, PageHead, PageSkeleton } from '../components/ui';

const TONES = ['#DDE4DC', '#E5DFD2', '#D9E1DE', '#E4DDD8'];
/** Avatar tone is deterministic from the id, so a student keeps the same colour everywhere. */
export function avatarTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
const slashDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(iso)).replaceAll('-', '/');
const PAY_STATE: Record<PaymentStatus, [string, string]> = { Confirmed: ['ok', '已確認'], Pending: ['wait', '待確認'], Rejected: ['bad', '已退回'] };
const level = (credits: number) => (credits === 0 ? 'out' : credits === 1 ? 'low' : 'ok');

/* ---------- 學生 list ---------- */

function StudentRow({ s }: { s: StudentSummary }) {
  const flag = s.status === 'Pending' ? { cls: 'pending', word: '確認中' } : s.credits === 0 ? { cls: 'out', word: '用完' } : s.credits === 1 ? { cls: 'low', word: '快用完' } : null;
  const next = s.status === 'Pending' ? '等待確認帳號' : s.paymentPending ? '收據待確認' : s.nextLesson ? `下次 ${fmtSlot(s.nextLesson.date, s.nextLesson.time)}` : '沒有預約';
  return (
    <li>
      <Link to={`/teacher/students/${s.id}`} className="sr" viewTransition>
        <span className="avatar sr-avatar" style={{ background: avatarTone(s.id) }} aria-hidden="true">{initialOf(s.name)}</span>
        <span className="sr-body">
          <span className="sr-name">{s.name}</span>
          <span className="sr-meta">{CLASS_TYPE_LABEL[s.classType]} · {s.status === 'Pending' ? '新學生' : <>剩 <b className={`sr-n ${level(s.credits)}`}>{s.credits}</b> 堂</>}</span>
          <span className={`sr-next${s.paymentPending && s.status !== 'Pending' ? ' pay' : ''}`}>{next}</span>
        </span>
        <span className={`sr-flag${flag ? ` ${flag.cls}` : ''}`}>{flag ? `● ${flag.word}` : ''}</span>
        <span className="sr-chev"><Icon name="chev" size={16} /></span>
      </Link>
    </li>
  );
}

export function Students() {
  const students = useStudents();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'out' | 'pay'>('all');
  const all = students.data ?? [];
  const isOut = (s: StudentSummary) => s.status === 'Active' && s.credits === 0;
  const shown = all.filter((s) => (filter === 'all' || (filter === 'out' && isOut(s)) || (filter === 'pay' && s.paymentPending))
    && (!q || s.name.includes(q) || (s.lineId ?? '').toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHead title="學生" over={students.data ? `${all.length} 位學生` : ' '} />
      <label className="search sr-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或 LINE ID" aria-label="搜尋學生" /></label>
      <div className="fchips sr-chips" role="group" aria-label="篩選">
        <button className="fchip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部</button>
        <button className="fchip" aria-pressed={filter === 'out'} onClick={() => setFilter('out')}>堂數用完 ({all.filter(isOut).length})</button>
        <button className="fchip" aria-pressed={filter === 'pay'} onClick={() => setFilter('pay')}>待付款 ({all.filter((s) => s.paymentPending).length})</button>
      </div>
      {students.isPending ? <ListSkeleton rows={6} /> : (
        <section className="card sr-card">
          {shown.length ? <ul className="sr-list">{shown.map((s) => <StudentRow key={s.id} s={s} />)}</ul> : <p className="caption" style={{ padding: '16px 0' }}>找不到學生。</p>}
        </section>
      )}
    </>
  );
}

/* ---------- 學生詳細 ---------- */

export function StudentDetailPage() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  if (student.isPending) return <PageSkeleton blocks={[120, 140, 160]} />;
  if (student.isError) return <ErrorCard error={student.error} retry={student.refetch} />;
  const s = student.data;
  const next = s.upcoming[0];
  const lastPay = s.payments[0];
  return (
    <>
      <div className="sd-top">
        <Link to="/teacher/students" className="icon-btn flat" aria-label="返回學生列表" viewTransition><Icon name="back" /></Link>
        <p className="overline">學生</p>
      </div>
      <div className="sd">
        <section className="sd-card sd-profile" aria-labelledby="sd-name">
          <div className="sd-who">
            <span className="avatar sd-avatar" style={{ background: avatarTone(s.id) }} aria-hidden="true">{initialOf(s.name)}</span>
            <div className="sd-id">
              <h1 className="sd-name" id="sd-name">{s.name}</h1>
              {(s.voiceType || s.grade) && <p className="sd-line">{[s.voiceType, s.grade].filter(Boolean).join(' · ')}</p>}
              {s.lineId && <p className="sd-line">LINE {s.lineId}</p>}
              <span className={`type-badge ${s.classType}`}>{CLASS_TYPE_LABEL[s.classType]}</span>
              <p className={`sd-consent ${s.consent.mediaWithdrawn ? 'warn' : s.consent.media ? 'ok' : ''}`}>
                {s.consent.media ? '● 同意肖像影音宣傳'
                  : s.consent.mediaWithdrawn ? `◆ 已撤回肖像影音授權${s.consent.mediaAt ? `（${new Date(s.consent.mediaAt).toLocaleDateString('zh-TW')}）` : ''}，請移除已公開的內容`
                  : '○ 未同意肖像影音宣傳，請勿公開照片或影片'}
                {s.consent.minor && <span className="sd-minor">未成年</span>}
              </p>
            </div>
          </div>
          <div className="sd-actions">
            {s.lineId
              ? <a className="sd-act primary" href={`https://line.me/ti/p/~${encodeURIComponent(s.lineId)}`} target="_blank" rel="noreferrer"><Icon name="msg" size={18} />LINE 聯絡</a>
              : <span className="sd-act" aria-disabled="true"><Icon name="msg" size={18} />沒有 LINE</span>}
            <Link to="adjust" className="sd-act">調整堂數</Link>
            <Link to="edit" className="sd-act">編輯</Link>
          </div>
        </section>

        <section className="sd-card" aria-labelledby="sd-quota-h">
          <h2 className="overline" id="sd-quota-h">課程狀態</h2>
          <dl className="sd-stats">
            <div><dt>剩餘</dt><dd><b className={`sd-big ${level(s.credits)}`}>{s.credits}</b> 堂</dd></div>
            <div><dt>已預約</dt><dd><b className="sd-mid">{s.booked}</b> 堂</dd></div>
            <div className="wide"><dt>下一堂</dt><dd>{next ? fmtSlot(next.date, next.time) : '沒有預約'}</dd></div>
          </dl>
          <div className="sd-remind">
            <Link to="remind" className={`sd-remind-btn${s.credits <= 1 ? ' urgent' : ''}`} aria-disabled={!s.remindChannel || undefined}
              onClick={(e) => { if (!s.remindChannel) e.preventDefault(); }}>
              <Icon name="bell" size={18} weight={s.credits <= 1 ? 'fill' : 'regular'} />通知學生繳學費
            </Link>
            <span className="sd-sub">
              {s.remindChannel ? (s.lastRemindedAt ? `上次提醒：${fmtRelative(s.lastRemindedAt)}` : `會透過 ${s.remindChannel === 'line' ? 'LINE' : 'Email'} 傳送`) : '沒有 LINE 或 Email，無法通知'}
            </span>
          </div>
        </section>

        <LessonsBlock s={s} />

        <section className="sd-card" aria-labelledby="sd-pay-h">
          <div className="sd-head">
            <h2 className="overline" id="sd-pay-h">付款</h2>
            {s.payments.length > 0 && <Link to="payments" className="sd-link">查看付款紀錄 <span aria-hidden="true">→</span></Link>}
          </div>
          {lastPay ? (
            <div className="sd-pay">
              <div><p className="sd-amt">{lastPay.packageSize} 堂 · {fmtMoney(lastPay.amount)}</p><p className="sd-sub">{slashDate(lastPay.uploadedAt)}</p></div>
              <span className={`sd-dot ${PAY_STATE[lastPay.status][0]}`}>● {PAY_STATE[lastPay.status][1]}</span>
            </div>
          ) : <p className="sd-empty">沒有付款紀錄。</p>}
        </section>
      </div>
      <Outlet />
    </>
  );
}

/** ONE lessons container: 下一堂 (one action) · 後續課程 (＋ 預約課程) · 上過的課 (3 + 查看全部) */
function LessonsBlock({ s }: { s: StudentDetail }) {
  const [allPast, setAllPast] = useState(false);
  const [next, ...later] = s.upcoming;
  const SHOWN = 3;
  const past = allPast ? s.past : s.past.slice(0, SHOWN);
  return (
    <section className="sd-ls" aria-label="課程">
      <div className="sd-ls-part" aria-labelledby="sd-next-h">
        <h2 className="sd-ls-h" id="sd-next-h">下一堂</h2>
        {next ? <LessonItem l={next} next /> : (
          <div className="sd-ls-none"><p>目前沒有預約的課。</p><Link to="book" className="sd-ls-link sd-add">＋ 預約課程</Link></div>
        )}
      </div>
      <div className="sd-ls-part" aria-labelledby="sd-later-h">
        <div className="sd-ls-head">
          <h2 className="sd-ls-h" id="sd-later-h">後續課程{later.length ? ` · ${later.length}` : ''}</h2>
          {next && <Link to="book" className="sd-ls-link sd-add">＋ 預約課程</Link>}
        </div>
        {later.length ? <ul className="sd-ls-list">{later.map((l) => <LessonItem key={l.id} l={l} />)}</ul> : <p className="sd-ls-empty">目前沒有其他已預約的課程</p>}
      </div>
      <div className="sd-ls-part" aria-labelledby="sd-past-h">
        <div className="sd-ls-head">
          <h2 className="sd-ls-h" id="sd-past-h">上過的課{s.past.length ? ` · ${s.past.length}` : ''}</h2>
          {s.past.length > SHOWN && (
            <button className="sd-ls-link" aria-expanded={allPast} onClick={() => setAllPast(!allPast)}>
              {allPast ? '收起' : <>查看全部 <span aria-hidden="true">→</span></>}
            </button>
          )}
        </div>
        {s.past.length ? (
          <ul className="sd-ls-past">
            {past.map((l) => (
              <li key={l.id}>
                <span>{fmtSlot(l.date, l.time)}</span>
                <span>{l.report?.status === 'approved' ? '已取消（回報）' : l.status === 'Attended' ? '已上課' : LESSON_TYPE_LABEL[l.type]}</span>
              </li>
            ))}
          </ul>
        ) : <p className="sd-ls-empty">還沒有上過課</p>}
      </div>
    </section>
  );
}

function LessonItem({ l, next }: { l: Lesson; next?: boolean }) {
  const { withdraw } = useProposals();
  const toast = useToast();
  const c = l.change;
  const btn = next ? 'sd-li-btn' : 'sd-ls-link';
  const status = c
    ? c.by === 'student'
      ? <p className="sd-li-st wait">● 等待改時間申請處理 · 學生想改到 {fmtSlot(c.toDate, c.toTime)}</p>
      : <p className="sd-li-st wait">◆ 等待學生回覆 · 你提議改到 {fmtSlot(c.toDate, c.toTime)}</p>
    : <p className="sd-li-st ok">● 已確認 · {fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>;
  const action = c
    ? c.by === 'student'
      ? <Link to="/teacher/requests" className={btn}>查看申請 <span aria-hidden="true">→</span></Link>
      : <button className={btn} disabled={withdraw.isPending} onClick={() => withdraw.mutateAsync(c.id)
        .then(() => toast({ text: '已收回提議，課程維持原時間' })).catch((e: Error) => toast({ text: e.message, kind: 'error' }))}>收回提議</button>
    : <Link to={`propose/${l.id}`} className={btn}>提議改時間{next ? <span aria-hidden="true">→</span> : null}</Link>;
  const body = (
    <>
      <div className="sd-li-body"><p className={`sd-li-when${c ? ' was' : ''}`}>{fmtSlot(l.date, l.time)}</p>{status}</div>
      {action}
    </>
  );
  return next ? <div className="sd-lesson is-next">{body}</div> : <li className="sd-lesson">{body}</li>;
}

/* ---------- sheets on 學生詳細 ---------- */

/** First open day from the strip, so the picker starts on something bookable. */
function useFirstOpenDay() {
  return useDays(addDays(studioToday(), -1)).data?.find((d) => d.state === 'open')?.date ?? null;
}

export function TeacherBookSheet() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  const book = useTeacherBook(id);
  const toast = useToast();
  const navigate = useNavigate();
  const close = useSheetClose(`/teacher/students/${id}`);
  const firstOpen = useFirstOpenDay();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate ?? firstOpen;
  const [time, setTime] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(true);
  const [key, setKey] = useState(newIdempotencyKey);
  const s = student.data;
  if (!s) return null;
  const submit = () => {
    if (!date || !time) return;
    const name = s.name, when = fmtSlot(date, time);
    book.mutateAsync({ date, time, key })
      .then(() => { toast({ text: `已幫${name}預約 ${when}` }); navigate(`/teacher/students/${id}`, { replace: true }); })
      .catch((e: Error) => { toast({ text: e.message, kind: 'error' }); setTime(null); setKey(newIdempotencyKey()); });
  };
  return (
    <RouteSheet title={`幫${s.name}預約`} parent={`/teacher/students/${id}`} dismissible={!book.isPending}>
      {s.credits === 0 ? (
        <div className="notice" role="alert"><Icon name="info" /><span>{s.name}沒有剩餘堂數。請先<Link to={`/teacher/students/${id}/adjust`} replace>調整堂數</Link>，或請學生購買新方案。</span></div>
      ) : (
        <>
          <SlotPicker date={date} time={time} onDate={(d) => { setPickedDate(d); setTime(null); }} onTime={setTime} onlyFree={onlyFree} setOnlyFree={setOnlyFree} />
          <p className="sd-sub">會用掉 1 堂（預約後剩 {s.credits - 1} 堂）。{s.name}會收到通知。</p>
          <button className="btn primary block" disabled={!date || !time || book.isPending} onClick={submit}>
            {book.isPending ? '預約中…' : date && time ? `預約 ${fmtSlot(date, time)}` : '請選擇時段'}
          </button>
        </>
      )}
      <button className="btn secondary block" onClick={() => close()}>返回</button>
    </RouteSheet>
  );
}

/** 提議改時間: the lesson moves only when the student says 可以. */
export function ProposeSheet() {
  const { id = '', lessonId } = useParams();
  const student = useStudent(id);
  const { propose } = useProposals();
  const toast = useToast();
  const navigate = useNavigate();
  const close = useSheetClose(`/teacher/students/${id}`);
  const firstOpen = useFirstOpenDay();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate ?? firstOpen;
  const [time, setTime] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(true);
  const [message, setMessage] = useState('');
  const s = student.data;
  const l = s?.upcoming.find((x) => x.id === lessonId);
  if (!s) return null;
  if (!l) {
    return (
      <RouteSheet title="提議改時間" parent={`/teacher/students/${id}`}>
        <p className="sd-empty">找不到這堂課，可能已經上過或取消了。</p>
        <button className="btn secondary block" onClick={() => close()}>返回</button>
      </RouteSheet>
    );
  }
  const replacesRequest = l.change?.by === 'student';
  const send = () => {
    if (!date || !time) return;
    const name = s.name;
    propose.mutateAsync({ lessonId: l.id, date, time, message: message.trim() })
      .then(() => { toast({ text: `已傳送給${name}，等學生回覆` }); navigate(`/teacher/students/${id}`, { replace: true }); })
      .catch((e: Error) => toast({ text: e.message, kind: 'error' }));
  };
  return (
    <RouteSheet title={`提議改時間 · ${s.name}`} parent={`/teacher/students/${id}`} dismissible={!propose.isPending}>
      <div className="inner row">
        <div className="grow stack g1"><p className="caption">目前時段（保留到學生同意）</p><p className="t">{fmtSlot(l.date, l.time)}</p></div>
        <Icon name="arrow" />
        <div className="grow stack g1"><p className="caption">提議時段</p><p className="t">{date && time ? fmtSlot(date, time) : '—'}</p></div>
      </div>
      {replacesRequest && (
        <div className="notice"><Icon name="info" /><span>{s.name}申請改到 {fmtSlot(l.change!.toDate, l.change!.toTime)}。送出提議後，這個申請會自動婉拒。</span></div>
      )}
      <SlotPicker date={date} time={time} onDate={(d) => { setPickedDate(d); setTime(null); }} onTime={setTime} onlyFree={onlyFree} setOnlyFree={setOnlyFree}
        exclude={{ date: l.date, time: l.time }} />
      <div className="field">
        <label htmlFor="pm">給學生的訊息（選填）</label>
        <textarea id="pm" className="input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="例如：那天早上我有事，下午可以嗎？" />
      </div>
      <button className="btn primary block" disabled={!date || !time || propose.isPending} onClick={send}>{propose.isPending ? '傳送中…' : '傳送提議給學生'}</button>
      <button className="btn secondary block" onClick={() => close()}>返回</button>
    </RouteSheet>
  );
}

/** 通知學生繳學費: editable message; sent after 10 s so 復原 can still stop it. */
export function RemindSheet() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  const studio = useStudio();
  const { mutation, undo } = useSendReminder(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const [edited, setEdited] = useState<string | null>(null);
  const s = student.data;
  if (!s) return null;
  const packages = (studio.data?.packages ?? []).filter((p) => !p.trial);
  const message = edited ?? [
    `嗨 ${s.name}，你目前剩 ${s.credits} 堂課。`,
    `想繼續上課的話，可以購買新的堂數${packages.length ? `（${packages.map((p) => `${p.size} 堂 ${fmtMoney(p.price)}`).join(' / ')}）` : ''}。`,
    '匯款後在 IRIS 上傳收據就可以了，謝謝！— Iris',
  ].join('\n');
  const recent = !!s.lastRemindedAt && Date.now() - Date.parse(s.lastRemindedAt) < 24 * 3_600_000;
  const channel = s.remindChannel === 'line' ? 'LINE' : 'Email';
  const to = s.remindChannel === 'line' ? s.lineId ?? s.name : s.email ?? '';
  const send = () => {
    const name = s.name;
    mutation.mutateAsync(message.trim())
      .then((r) => toast({ text: `10 秒後透過 ${r.channel === 'line' ? 'LINE' : 'Email'} 傳給 ${name}`, undo: () => undo(r.id) }))
      .catch((e: Error) => toast({ text: e.message, kind: 'error' }));
    close();
  };
  return (
    <RouteSheet title="通知學生繳學費" parent={`/teacher/students/${id}`}>
      <p className="rm-to">
        <span className={s.remindChannel === 'line' ? 'li-mark' : 'rm-mail'} aria-hidden="true"><Icon name={s.remindChannel === 'line' ? 'msg' : 'mail'} size={14} /></span>
        <span>透過 <b>{channel}</b> 傳給 {s.name}<small>{to}</small></span>
      </p>
      {recent && <p className="notice"><Icon name="info" /><span>{fmtRelative(s.lastRemindedAt!)}已經提醒過了，確定要再傳一次嗎？</span></p>}
      <div className="field">
        <label htmlFor="rm-msg">訊息內容</label>
        <textarea id="rm-msg" placeholder="寫給學生的提醒內容" className="input rm-msg" rows={5} maxLength={500} value={message} onChange={(e) => setEdited(e.target.value)} />
        <p className="av-hint">{message.length} / 500 · 學生的 IRIS 通知也會收到這則訊息。</p>
      </div>
      <button className="btn primary block" disabled={!message.trim() || mutation.isPending} onClick={send}><Icon name="bell" size={18} />傳送提醒</button>
      <button className="btn secondary block" onClick={() => close()}>取消</button>
    </RouteSheet>
  );
}

const ADJUST_REASONS = ['補課', '贈送', '修正錯誤', '其他'];

/** 調整堂數: ±1–4 with a required reason; logged, the student is told, 30 s undo on the server. */
export function AdjustCreditsSheet() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  const adjust = useAdjustCredits(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const s = student.data;
  if (!s) return null;
  const delta = sign * amount;
  const after = s.credits + delta;
  const negative = after < 0;
  const fullReason = reason === '其他' ? note.trim() : [reason, note.trim()].filter(Boolean).join('：');
  const ok = !!reason && !negative && (reason !== '其他' || note.trim().length > 0);
  const save = () => {
    const name = s.name;
    adjust.mutateAsync({ delta, reason: fullReason })
      .then((r) => toast({ text: `${name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} 堂（已記錄並通知）`, undo: () => adjust.undo(r.id) }))
      .catch((e: Error) => toast({ text: e.message, kind: 'error' }));
    close();
  };
  return (
    <RouteSheet title="調整堂數" parent={`/teacher/students/${id}`} dismissible={!adjust.isPending}>
      <div className="adj-preview" aria-live="polite">
        <span className="sd-sub">{s.name}</span>
        <p><b>{s.credits}</b> 堂 <span aria-hidden="true">→</span><span className="sr-only">調整後</span> <b className={negative ? 'neg' : ''}>{after}</b> 堂</p>
      </div>
      <fieldset className="adj-field">
        <legend>調整</legend>
        <div className="fchips" role="radiogroup" aria-label="增加或減少">
          <button role="radio" aria-checked={sign === 1} className="fchip" onClick={() => setSign(1)}>增加</button>
          <button role="radio" aria-checked={sign === -1} className="fchip" onClick={() => setSign(-1)}>減少</button>
        </div>
        <div className="fchips" role="radiogroup" aria-label="堂數">
          {[1, 2, 3, 4].map((n) => <button key={n} role="radio" aria-checked={amount === n} aria-label={`${n} 堂`} className="fchip num" onClick={() => setAmount(n)}>{n}</button>)}
        </div>
        {negative && <p className="adj-err">堂數不能小於 0。</p>}
      </fieldset>
      <fieldset className="adj-field">
        <legend>原因（必填）</legend>
        <div className="fchips" role="radiogroup" aria-label="原因">
          {ADJUST_REASONS.map((r) => <button key={r} role="radio" aria-checked={reason === r} className="fchip" onClick={() => setReason(r)}>{r}</button>)}
        </div>
        <label className="sr-only" htmlFor="adj-note">備註</label>
        <input id="adj-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={reason === '其他' ? '請寫下原因' : '備註（選填）'} />
      </fieldset>
      <p className="sd-sub">調整會留下紀錄，並通知學生。</p>
      <button className="btn primary block" disabled={!ok || adjust.isPending} onClick={save}>儲存調整</button>
    </RouteSheet>
  );
}

/** 編輯: class type + 已完成諮詢／面談 (unlocks the one-time 單堂課 for this student). */
export function EditStudentSheet() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  const setClassType = useSetClassType(id);
  const setConsultation = useSetConsultationCompleted(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const [type, setType] = useState<ClassType | null>(null);
  const [consulted, setConsulted] = useState<boolean | null>(null);
  const s = student.data;
  if (!s) return null;
  const t = type ?? s.classType;
  const c = consulted ?? !!s.consultationCompleted;
  const unchanged = t === s.classType && c === !!s.consultationCompleted;
  const save = () => {
    const name = s.name;
    (t === s.classType ? Promise.resolve() : setClassType.mutateAsync(t))
      .then(() => (c === !!s.consultationCompleted ? null : setConsultation.mutateAsync(c)))
      .then(() => toast({ text: `${name} 已更新` }))
      .catch((e: Error) => toast({ text: e.message, kind: 'error' }));
    close();
  };
  return (
    <RouteSheet title={`編輯 ${s.name}`} parent={`/teacher/students/${id}`}>
      <fieldset className="adj-field">
        <legend>課程類型</legend>
        <div className="fchips" role="radiogroup" aria-label="課程類型">
          {(['private', 'group', 'trial'] as const).map((v) => <button key={v} role="radio" aria-checked={t === v} className="fchip" onClick={() => setType(v)}>{CLASS_TYPE_LABEL[v]}</button>)}
        </div>
      </fieldset>
      <label className="au-ck">
        <input type="checkbox" checked={c} onChange={(e) => setConsulted(e.target.checked)} />
        <span>已完成諮詢／面談（可購買一次單堂課 NT$1,500）</span>
      </label>
      <button className="btn primary block" disabled={unchanged || setClassType.isPending || setConsultation.isPending} onClick={save}>儲存</button>
      <button className="btn secondary block" onClick={() => close()}>取消</button>
    </RouteSheet>
  );
}

export function PaymentHistorySheet() {
  const { id = '' } = useParams();
  const s = useStudent(id).data;
  if (!s) return null;
  return (
    <RouteSheet title="付款紀錄" parent={`/teacher/students/${id}`}>
      <ul className="sd-hist pay">
        {s.payments.map((p) => (
          <li key={p.id}>
            <span><b>{p.packageSize} 堂 · {fmtMoney(p.amount)}</b><br /><small>{slashDate(p.uploadedAt)}</small></span>
            <span className={`sd-dot ${PAY_STATE[p.status][0]}`}>● {PAY_STATE[p.status][1]}</span>
          </li>
        ))}
      </ul>
    </RouteSheet>
  );
}
