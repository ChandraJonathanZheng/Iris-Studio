import { useMemo, useRef, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { ApiError, newIdempotencyKey } from '../lib/api';
import { CLASS_TYPE_LABEL, compareSlot, fmtDate, fmtDuration, fmtMoney, fmtRelative, fmtSlot, LESSON_TYPE_LABEL } from '../lib/date';
import {
  useAdjustCredits, useProposals, useSendReminder, useSetClassType, useStudent, useStudents, useTeacherBook,
} from '../lib/queries';
import type { ClassType, Lesson, Payment, StudentSummary } from '../lib/types';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { SlotPicker, type Picked } from '../components/SlotPicker';
import { useToast } from '../components/Toast';
import { Avatar, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Segmented, Tag } from '../components/ui';

const errText = (e: unknown, f = '發生錯誤，請稍後再試。') => (e instanceof ApiError ? e.message : f);
const PAY_TAG = { Pending: <Tag tone="pending">確認中</Tag>, Confirmed: <Tag tone="ok">已確認</Tag>, Rejected: <Tag tone="bad">已退回</Tag> } as const;

/* ---------------------------------------------------------------- 學生列表 */
type Filter = 'all' | ClassType | 'low' | 'pending';
const FILTERS: { v: Filter; t: string }[] = [
  { v: 'all', t: '全部' }, { v: 'private', t: '一對一' }, { v: 'group', t: '團體課' }, { v: 'trial', t: '體驗課' }, { v: 'low', t: '快用完／用完' }, { v: 'pending', t: '確認中' },
];

function creditTone(s: StudentSummary) { return s.credits === 0 ? 'var(--bad)' : s.credits <= 1 ? 'var(--warn)' : 'var(--ink)'; }

function StudentRow({ s }: { s: StudentSummary }) {
  return (
    <Link to={s.id} className="li" style={{ minHeight: 81 }}>
      <Avatar name={s.name} id={s.id} />
      <div className="grow">
        <div className="name">{s.name}</div>
        <div className="cap">{CLASS_TYPE_LABEL[s.classType]}{s.nextLesson ? ` · 下一堂 ${fmtSlot(s.nextLesson.date, s.nextLesson.time)}` : ' · 沒有預約'}</div>
      </div>
      <div className="stack s2" style={{ alignItems: 'flex-end', gap: 2 }}>
        <span className="hero-num" style={{ color: creditTone(s), fontSize: 20 }}>{s.credits}<span className="cap"> 堂</span></span>
        {s.status === 'Pending' ? <Tag tone="pending">確認中</Tag> : s.credits === 0 ? <Tag tone="bad">用完</Tag> : s.credits <= 1 ? <Tag tone="warn">快用完</Tag> : null}
      </div>
    </Link>
  );
}

export function Students() {
  const students = useStudents();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(() => (students.data ?? []).filter((s) => {
    if (q.trim() && !s.name.includes(q.trim())) return false;
    if (filter === 'low') return s.credits <= 1 && s.status === 'Active';
    if (filter === 'pending') return s.status === 'Pending';
    return filter === 'all' || s.classType === filter;
  }), [students.data, q, filter]);

  return (
    <div className="page wide">
      <PageHead title="學生" />
      <div className="field"><label className="sr" htmlFor="sq">搜尋學生</label>
        <input id="sq" className="input" style={{ minHeight: 54 }} type="search" placeholder="搜尋姓名" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips" role="group" aria-label="篩選">{FILTERS.map((f) => <button key={f.v} className="chip filter" aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.t}</button>)}</div>
      {students.isPending ? <ListSkeleton rows={6} /> : students.isError ? <ErrorCard error={students.error} retry={() => students.refetch()} />
        : list.length === 0 ? <Empty text="找不到符合的學生。" /> : <div className="list">{list.map((s) => <StudentRow key={s.id} s={s} />)}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- 學生詳細 */
function UpcomingRow({ l }: { l: Lesson }) {
  const { withdraw } = useProposals();
  const toast = useToast();
  const c = l.change;
  return (
    <div className="li" style={{ flexWrap: 'wrap' }}>
      <div className="grow"><div className="name" style={{ fontSize: 16 }}>{fmtSlot(l.date, l.time)}</div><div className="cap">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</div></div>
      {c?.by === 'teacher' ? (
        <><Tag tone="warn">等待學生回覆</Tag>
          <button className="btn link" disabled={withdraw.isPending} onClick={() => withdraw.mutate(c.id, { onSuccess: () => toast({ text: '已收回提議' }) })}>收回</button></>
      ) : c?.by === 'student' ? (
        <Link className="btn link" to="/teacher/requests">查看申請 →</Link>
      ) : <Link className="btn secondary sm" to={`propose/${l.id}`}>提議改時間</Link>}
    </div>
  );
}

export function StudentDetailPage() {
  const { id = '' } = useParams();
  const st = useStudent(id);
  const s = st.data;
  const upcoming = useMemo(() => (s?.upcoming ?? []).slice().sort(compareSlot), [s]);
  const last = s?.payments?.[0];

  return (
    <div className="page">
      <PageHead title={s?.name ?? '學生'} back />
      {st.isPending ? <PageSkeleton blocks={[120, 180, 200]} /> : st.isError ? <ErrorCard error={st.error} retry={() => st.refetch()} /> : (
        <>
          <section className="card">
            <div className="row"><Avatar name={s!.name} id={s!.id} size={56} />
              <div className="grow"><div className="name" style={{ fontSize: 20 }}>{s!.name}</div>
                <div className="sub">{CLASS_TYPE_LABEL[s!.classType]}{s!.voiceType ? ` · ${s!.voiceType}` : ''}{s!.grade ? ` · ${s!.grade}` : ''}</div>
                {s!.status === 'Pending' && <Tag tone="pending">確認中</Tag>}</div></div>
            {(s!.email || s!.phone) && <div className="cap">{[s!.email, s!.phone].filter(Boolean).join(' · ')}</div>}
            {s!.goal && <p className="sub">目標：「{s!.goal}」</p>}
            <p className={`sd-consent ${s!.consent.mediaWithdrawn ? 'warn' : s!.consent.media ? 'ok' : ''}`}>
              {s!.consent.media ? '● 同意肖像影音宣傳' : s!.consent.mediaWithdrawn ? `◆ 已撤回肖像影音授權${s!.consent.mediaAt ? `（${new Date(s!.consent.mediaAt!).toLocaleDateString('zh-TW')}）` : ''}，請移除已公開的內容` : '○ 未同意肖像影音宣傳，請勿公開照片或影片'}
              {s!.consent.minor && <span className="sd-minor">未成年</span>}
            </p>
            <div className="row wrap">
              {s!.lineId && <a className="btn secondary sm" href={`https://line.me/ti/p/~${encodeURIComponent(s!.lineId)}`} target="_blank" rel="noreferrer"><Icon name="msg" size={18} />LINE 聯絡</a>}
              <Link className="btn secondary sm" to="adjust">調整堂數</Link>
              <Link className="btn secondary sm" to="edit">編輯</Link>
            </div>
          </section>

          <section className="card" aria-label="課程狀態">
            <h2 className="sec">課程狀態</h2>
            <div className="grid2">
              <div><div className="cap">剩餘</div><div className="hero-num" style={{ color: creditTone(s!) }}>{s!.credits} 堂</div></div>
              <div><div className="cap">已預約</div><div className="hero-num">{s!.booked} 堂</div></div>
            </div>
            <div className="sub">下一堂：{s!.nextLesson ? fmtSlot(s!.nextLesson.date, s!.nextLesson.time) : '尚未預約'}</div>
            <Link className={`btn ${s!.credits <= 1 ? 'primary' : 'secondary'} block`} to="remind"><Icon name="bell" size={18} />通知學生繳學費</Link>
            {s!.lastRemindedAt && <p className="cap">上次提醒：{fmtRelative(s!.lastRemindedAt)}</p>}
          </section>

          <section className="stack s2" aria-label="即將上課">
            <div className="row between"><h2 className="sec">即將上課</h2><Link className="btn primary sm" to="book"><Icon name="plus" size={18} />預約課程</Link></div>
            {upcoming.length ? <div className="list">{upcoming.map((l) => <UpcomingRow key={l.id} l={l} />)}</div> : <Empty text="還沒有預約的課。" />}
          </section>

          <section className="card" aria-label="最近付款">
            <h2 className="sec">最近付款</h2>
            {last ? <div className="row between"><div><div className="name" style={{ fontSize: 16 }}>{last.packageSize} 堂 · {fmtMoney(last.amount)}</div><div className="cap">{fmtRelative(last.uploadedAt)}</div></div>{PAY_TAG[last.status]}</div> : <p className="sub">還沒有付款紀錄。</p>}
            <Link className="btn link" style={{ alignSelf: 'flex-start' }} to="payments">查看付款紀錄 →</Link>
          </section>

          {s!.past.length > 0 && (
            <section className="stack s2" aria-label="上課紀錄"><h2 className="sec">上課紀錄</h2>
              <div className="list">{s!.past.slice(0, 10).map((l) => <div key={l.id} className="li muted-row"><div className="grow">{fmtDate(l.date)} {l.time}</div><Tag tone="grey">{l.status === 'Attended' ? '已上課' : '已取消'}</Tag></div>)}</div></section>
          )}
        </>
      )}
      <Outlet />
    </div>
  );
}

/* ---------------------------------------------------------------- 老師預約 / 提議 */
export function TeacherBookSheet() {
  const { id = '' } = useParams();
  const st = useStudent(id);
  const book = useTeacherBook(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const key = useRef(newIdempotencyKey());
  const [pick, setPick] = useState<Picked | null>(null);
  const credits = st.data?.credits ?? 0;

  return (
    <RouteSheet title={`幫 ${st.data?.name ?? '學生'} 預約`} parent={`/teacher/students/${id}`}>
      {st.data && credits < 1 ? (
        <><div className="info">這位學生沒有剩餘堂數，請先調整堂數。</div><Link className="btn primary block" replace to={`/teacher/students/${id}/adjust`}>調整堂數</Link></>
      ) : (
        <>
          <SlotPicker value={pick} onChange={setPick} />
          <p className="sub">會用掉 1 堂，剩 {Math.max(0, credits - 1)} 堂。學生會收到「老師新增了一堂課」。</p>
          <button className="btn primary block" disabled={!pick || book.isPending}
            onClick={() => pick && book.mutate({ ...pick, key: key.current }, { onSuccess: () => { close(); toast({ text: `已預約 ${fmtSlot(pick.date, pick.time)}` }); }, onError: (e) => toast({ text: errText(e), kind: 'error' }) })}>
            {pick ? `預約 ${fmtSlot(pick.date, pick.time)}` : '請選擇時段'}
          </button>
        </>
      )}
    </RouteSheet>
  );
}

export function ProposeSheet() {
  const { id = '', lessonId } = useParams();
  const st = useStudent(id);
  const { propose } = useProposals();
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const [pick, setPick] = useState<Picked | null>(null);
  const [msg, setMsg] = useState('');
  const l = st.data?.upcoming.find((x) => x.id === lessonId);

  return (
    <RouteSheet title="提議改時間" parent={`/teacher/students/${id}`}>
      {!l ? <p className="sub">{st.isPending ? '載入中…' : '找不到這堂課。'}</p> : (
        <>
          <div className="info">目前時段（保留到學生同意）：<b>{fmtSlot(l.date, l.time)}</b><br />學生按「可以」才會改，不會自動變動。</div>
          <SlotPicker value={pick} onChange={setPick} ignore={{ date: l.date, time: l.time }} />
          <div className="field"><label htmlFor="pm">想對學生說的話</label><textarea id="pm" className="textarea" maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="例如：那天臨時有演出，想改到這個時間" /></div>
          <button className="btn primary block" disabled={!pick || !msg.trim() || propose.isPending}
            onClick={() => pick && propose.mutate({ lessonId: l.id, ...pick, message: msg.trim() }, { onSuccess: () => { close(); toast({ text: '已送出提議，等學生回覆' }); }, onError: (e) => toast({ text: errText(e), kind: 'error' }) })}>
            {!pick ? '請選擇新時段' : !msg.trim() ? '請寫幾句話' : '送出提議'}
          </button>
        </>
      )}
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 通知繳費 */
export function RemindSheet() {
  const { id = '' } = useParams();
  const st = useStudent(id);
  const { mutation, undo } = useSendReminder(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const s = st.data;
  const [msg, setMsg] = useState<string | null>(null);
  const text = msg ?? (s ? `${s.name} 你好，目前堂數剩 ${s.credits} 堂，下次上課前可以先匯款喔。謝謝！` : '');
  const recent = !!s?.lastRemindedAt && Date.now() - new Date(s.lastRemindedAt).getTime() < 24 * 3_600_000;
  const via = s?.remindChannel === 'line' ? 'LINE' : 'Email';

  return (
    <RouteSheet title="通知學生繳學費" parent={`/teacher/students/${id}`}>
      {!s ? <p className="sub">載入中…</p> : !s.remindChannel ? <div className="info">這位學生沒有 LINE 或 Email，無法通知。</div> : (
        <>
          <p className="sub">會透過 <b>{via}</b> 傳給 {s.name}。</p>
          {recent && <div className="info" style={{ background: 'var(--warn-tint)' }}>◆ 24 小時內已提醒過（{fmtRelative(s.lastRemindedAt!)}），確定要再傳嗎？</div>}
          <div className="field"><label htmlFor="rm">訊息</label><textarea id="rm" className="textarea" style={{ minHeight: 140 }} maxLength={500} value={text} onChange={(e) => setMsg(e.target.value)} /><span className="cap">{text.length} / 500</span></div>
          <button className="btn primary block" disabled={!text.trim() || mutation.isPending}
            onClick={() => mutation.mutate(text.trim(), { onSuccess: (r) => { close(); toast({ text: `稍後透過 ${r.channel === 'both' ? 'LINE 和 Email' : r.channel === 'line' ? 'LINE' : 'Email'} 傳給 ${s.name}`, undo: () => undo(r.id) }); }, onError: (e) => toast({ text: errText(e), kind: 'error' }) })}>傳送</button>
        </>
      )}
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 調整堂數 */
const REASONS = ['補課', '贈送', '修正錯誤', '其他'] as const;

export function AdjustCreditsSheet() {
  const { id = '' } = useParams();
  const st = useStudent(id);
  const adjust = useAdjustCredits(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const [dir, setDir] = useState<'add' | 'sub'>('add');
  const [n, setN] = useState(1);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const cur = st.data?.credits ?? 0;
  const delta = dir === 'add' ? n : -n;
  const next = cur + delta;
  const valid = next >= 0 && !!reason && (reason !== '其他' || !!note.trim());

  const save = () => {
    if (!valid || !reason) return;
    adjust.mutate({ delta, reason: note.trim() ? `${reason}：${note.trim()}` : reason }, {
      onSuccess: () => { close(); toast({ text: `${st.data?.name} 的堂數：${cur} → ${next}`, undo: () => adjust.mutateAsync({ delta: -delta, reason: '復原上一次調整' }).then(() => undefined) }); },
      onError: (e) => toast({ text: errText(e), kind: 'error' }),
    });
  };

  return (
    <RouteSheet title="調整堂數" parent={`/teacher/students/${id}`} className="adjust-sheet"
      footer={<>
        <div className="row between"><span className="sub">調整後</span><span className="hero-num" aria-live="polite">{cur} → {next}</span></div>
        {next < 0 && <p className="err">堂數不能少於 0。</p>}
        <button className="btn primary block" disabled={!valid || adjust.isPending} onClick={save}>{!reason ? '請選擇原因' : '確認調整'}</button>
      </>}>
      <Segmented label="增加或減少" value={dir} onChange={setDir} options={[{ value: 'add', label: '增加' }, { value: 'sub', label: '減少' }]} />
      <div className="chips" role="radiogroup" aria-label="堂數">{[1, 2, 3, 4].map((v) => <button key={v} role="radio" aria-checked={n === v} className="chip choice" onClick={() => setN(v)}>{v} 堂</button>)}</div>
      <div className="stack s2" role="radiogroup" aria-label="原因"><span className="label">原因（必填）</span>
        <div className="chips" style={{ flexWrap: 'wrap' }}>{REASONS.map((r) => <button key={r} role="radio" aria-checked={reason === r} className="chip choice" onClick={() => setReason(r)}>{r}</button>)}</div></div>
      <div className="field"><label htmlFor="an">備註{reason === '其他' ? '（必填）' : '（選填）'}</label><input id="an" className="input" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} /></div>
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 編輯 / 付款紀錄 */
export function EditStudentSheet() {
  const { id = '' } = useParams();
  const st = useStudent(id);
  const set = useSetClassType(id);
  const toast = useToast();
  const close = useSheetClose(`/teacher/students/${id}`);
  const cur = st.data?.classType;
  return (
    <RouteSheet title="編輯學生" parent={`/teacher/students/${id}`}>
      <div className="stack s2" role="radiogroup" aria-label="課程類型"><span className="label">課程類型</span>
        <p className="cap">預約時會自動套用到每堂課。</p>
        <div className="chips" style={{ flexWrap: 'wrap' }}>{(Object.keys(CLASS_TYPE_LABEL) as ClassType[]).map((t) => (
          <button key={t} role="radio" aria-checked={cur === t} className="chip choice" disabled={set.isPending}
            onClick={() => t !== cur && set.mutate(t, { onSuccess: () => { close(); toast({ text: `已改為${CLASS_TYPE_LABEL[t]}`, undo: () => cur && set.mutate(cur) }); } })}>{CLASS_TYPE_LABEL[t]}</button>))}</div></div>
    </RouteSheet>
  );
}

export function PaymentHistorySheet() {
  const { id = '' } = useParams();
  const st = useStudent(id);
  return (
    <RouteSheet title="付款紀錄" parent={`/teacher/students/${id}`}>
      {!st.data?.payments.length ? <Empty text="還沒有付款紀錄。" /> : (
        <div className="list">{st.data.payments.map((p: Payment) => (
          <div key={p.id} className="li"><div className="grow"><div className="name" style={{ fontSize: 16 }}>{p.trial ? '體驗課' : '方案'} · {p.packageSize} 堂 · {fmtMoney(p.amount)}</div>
            <div className="cap">{fmtRelative(p.uploadedAt)}{p.rejectReason ? ` · 「${p.rejectReason}」` : ''}</div></div>{PAY_TAG[p.status]}</div>
        ))}</div>
      )}
    </RouteSheet>
  );
}
