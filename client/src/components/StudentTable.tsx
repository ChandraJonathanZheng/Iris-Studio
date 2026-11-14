import { SaveButton, useSaveFlow } from './SaveButton';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from './Icon';
import { ListSkeleton } from './ui';
import { useToast } from './Toast';
import { useAddStudentNote, useSetStudentDisabled, useStudents } from '../lib/queries';
import { initialOf } from '../lib/date';
import type { StudentSummary } from '../lib/types';
import { closeModal, openModal } from '../lib/modalMotion';

/**
 * 學生列表 (teacher): a real table like an admin panel —
 * ID · 學生 · 性別 · 聲部 · 上課資年(m) · 堂課額度 · 操作, 8 students per page, no multi-select.
 * On a phone the table scrolls sideways while ID + name stay pinned on the left.
 */
const PAGE = 8;
const TONES = ['#DDE4DC', '#E6DCD6', '#DCE2E6', '#E5E1D2', '#E1DCE6'];
const tone = (id: string) => TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
/** whole months between joinedAt and today */
const monthsSince = (iso: string) => {
  const a = new Date(iso), b = new Date();
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0));
};
const GENDER = { M: '男', F: '女' } as const;
type Seg = NonNullable<StudentSummary['segment']>;
const SEGS: [Seg, string, string][] = [
  ['active', '活躍', '還有剩餘堂數'],
  ['cold', '冷漠', '超過 3 個月沒有購買，也沒有上課'],
  ['lapsed', '未購買課程', '堂數用完，最後一堂課在 3 個月內'],
  ['noTrial', '未上單堂課', '已通過申請，但還沒買單堂課'],
];

export function StudentsTable() {
  const students = useStudents();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | Seg>('all');
  const [page, setPage] = useState(1);
  const [dlg, setDlg] = useState<{ kind: 'note' | 'homework' | 'disable'; s: StudentSummary } | null>(null);
  const all = students.data ?? [];
  const list = all
    .filter((s) => (f === 'all' || s.segment === f) &&
      (!q || s.name.includes(q) || (s.lineId ?? '').toLowerCase().includes(q.toLowerCase()) || String(s.studentNo).includes(q)))
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.studentNo - b.studentNo);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages);
  const rows = list.slice((cur - 1) * PAGE, cur * PAGE);
  useEffect(() => { setPage(1); }, [q, f]); // a new search/filter starts again at page 1
  const count = (pred: (s: StudentSummary) => boolean) => all.filter(pred).length;
  const enable = useSetStudentDisabled();
  const toast = useToast();

  return (
    <>
      <nav className="st-crumbs" aria-label="麵包屑"><ol><li><Link to="/teacher" viewTransition>首頁</Link></li><li><span>學生</span></li><li aria-current="page">列表</li></ol></nav>
      <div className="st-head">
        <h1 className="h1">學生</h1>
        <span className="st-total"><Icon name="users" size={16} />共 <b>{all.length}</b> 位</span>
      </div>
      <label className="search sr-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名、ID 或 LINE ID" aria-label="搜尋學生" /></label>
      <div className="fchips sr-chips" role="group" aria-label="篩選">
        <button className="fchip" aria-pressed={f === 'all'} onClick={() => setF('all')}>全部</button>
        {SEGS.map(([k, label, hint]) => (
          <button key={k} className="fchip" aria-pressed={f === k} onClick={() => setF(k)} title={hint}>{label} ({count((s) => s.segment === k)})</button>
        ))}
      </div>

      {students.isPending ? <ListSkeleton rows={6} /> : (
        <section className="st-card" aria-label="學生列表">
          <div className="st-scroll" tabIndex={0} aria-label="學生表格，可左右捲動">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col" className="c-id">ID</th>
                  <th scope="col" className="c-who">學生</th>
                  <th scope="col">性別</th>
                  <th scope="col">聲部</th>
                  <th scope="col" className="num">上課資年 (m)</th>
                  <th scope="col" className="num">堂課額度</th>
                  <th scope="col" className="c-act">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={s.disabled ? 'is-off' : undefined}>
                    <td className="c-id">{s.studentNo || "—"}{s.status === 'Pending' && !s.disabled && <span className="st-n" title="新學生"><svg className="st-n-rays" viewBox="0 0 40 40" aria-hidden="true"><line x1="30.4" y1="21.5" x2="35.3" y2="22.2" /><line x1="28.3" y1="28.0" x2="30.4" y2="30.1" /><line x1="21.8" y1="30.3" x2="22.7" y2="35.3" /><line x1="15.0" y1="30.3" x2="13.6" y2="33.0" /><line x1="10.7" y1="24.9" x2="6.3" y2="27.3" /><line x1="8.6" y1="18.4" x2="5.6" y2="18.0" /><line x1="12.4" y1="12.7" x2="8.9" y2="9.2" /><line x1="18.0" y1="8.7" x2="17.5" y2="5.7" /><line x1="24.6" y1="10.6" x2="26.8" y2="6.1" /><line x1="30.2" y1="14.6" x2="32.8" y2="13.2" /></svg><span className="st-n-l" aria-hidden="true">N</span><span className="sr-only">新學生</span></span>}</td>
                    <th scope="row" className="c-who">
                      <span className="st-who">
                        <span className="st-av" style={{ background: tone(s.id) }} aria-hidden="true">{s.avatarUrl ? <img src={s.avatarUrl} alt="" /> : initialOf(s.name)}</span>
                        <span className="st-name">{s.name}{s.disabled && <span className="st-off">已停用</span>}</span>
                      </span>
                    </th>
                    <td>{s.gender ? GENDER[s.gender] : '—'}</td>
                    <td>{s.voiceType ?? '—'}</td>
                    <td className="num">{monthsSince(s.joinedAt)}</td>
                    <td className="num"><span className={`st-q ${s.credits === 0 ? 'out' : s.credits === 1 ? 'low' : ''}`}>{s.credits}</span> 堂</td>
                    <td className="c-act">
                      <span className="st-acts">
                        <Link to={`/teacher/students/${s.id}`} className="st-ic" viewTransition aria-label={`${s.name} 的學生資料`} title="學生資料"><Icon name="profile" size={20} /></Link>
                        <Link to={`/teacher/students/${s.id}/lessons`} className="st-ic" viewTransition aria-label={`${s.name} 的課程`} title="課程"><Icon name="lessons" size={20} /></Link>
                        <RowMenu s={s} onPick={(k) => {
                          if (k === 'enable') enable.mutate({ id: s.id, disabled: false }, { onSuccess: () => toast({ text: `已重新啟用 ${s.name}` }) });
                          else setDlg({ kind: k, s });
                        }} />
                      </span>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="st-empty">找不到學生。</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager page={cur} pages={pages} total={list.length} onPage={setPage} />
        </section>
      )}
      {dlg && (dlg.kind === 'disable'
        ? <DisableDialog s={dlg.s} onClose={() => setDlg(null)} />
        : <NoteDialog s={dlg.s} kind={dlg.kind} onClose={() => setDlg(null)} />)}
    </>
  );
}

/* ---------- pagination: « ‹ 第 1 / 2 頁 › » ---------- */
function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (n: number) => void }) {
  const from = total ? (page - 1) * PAGE + 1 : 0, to = Math.min(total, page * PAGE);
  const go = (n: number) => { onPage(n); document.querySelector('.st-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  return (
    <nav className="st-pager" aria-label="分頁">
      <span className="st-range">{from}–{to}，共 {total} 位</span>
      <span className="st-pg">
        <button type="button" disabled={page <= 1} onClick={() => go(1)} aria-label="第一頁"><Icon name="first" size={16} /></button>
        <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="上一頁"><Icon name="back" size={16} /></button>
        <span className="st-pnum" aria-live="polite">第 {page} / {pages} 頁</span>
        <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="下一頁"><Icon name="chev" size={16} /></button>
        <button type="button" disabled={page >= pages} onClick={() => go(pages)} aria-label="最後一頁"><Icon name="last" size={16} /></button>
      </span>
    </nav>
  );
}

/* ---------- "…" menu: 編輯 · 給筆記 · 給作業 · 停用 ---------- */
type Pick = 'note' | 'homework' | 'disable' | 'enable';
function RowMenu({ s, onPick }: { s: StudentSummary; onPick: (k: Pick) => void }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  // position: fixed under the button, so the table's sideways-scroll box can't clip the menu;
  // re-measured on scroll/resize so it stays attached to its button
  const place = () => {
    if (!btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const below = r.bottom + 6 + 200 < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : r.top - 6 - 196, right: window.innerWidth - r.right });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away); window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, !!pos]);
  const keys = (e: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const pick = (k: Pick | 'edit') => { setOpen(false); if (k === 'edit') nav(`/teacher/students/${s.id}/edit`, { viewTransition: true }); else onPick(k); };
  return (
    <>
      <button ref={btn} type="button" className="st-ic" aria-haspopup="menu" aria-expanded={open} aria-label={`${s.name} 的其他操作`} title="其他"
        onClick={() => setOpen((o) => !o)}><Icon name="more" size={22} weight="bold" /></button>
      {open && pos && (
        <div ref={menu} className="st-menu" role="menu" aria-label={`${s.name} 的其他操作`} style={{ top: pos.top, right: pos.right }} onKeyDown={keys}>
          <button type="button" role="menuitem" onClick={() => pick('edit')}><Icon name="edit" size={18} />編輯</button>
          <button type="button" role="menuitem" onClick={() => pick('note')}><Icon name="note" size={18} />給筆記</button>
          <button type="button" role="menuitem" onClick={() => pick('homework')}><Icon name="homework" size={18} />給作業</button>
          <hr />
          {s.disabled
            ? <button type="button" role="menuitem" onClick={() => pick('enable')}><Icon name="restore" size={18} />重新啟用</button>
            : <button type="button" role="menuitem" className="danger" onClick={() => pick('disable')}><Icon name="ban" size={18} />停用</button>}
        </div>
      )}
    </>
  );
}

/* ---------- small centred dialogs ---------- */
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { openModal(ref.current); }, []);
  // every way out (取消 / ✕ / Esc / backdrop / after saving) runs the shared close motion; the native "close" event
  // that fires when it ends is what finally calls onClose (the parent unmounts us then)
  const close = () => closeModal(ref.current);
  const props = {
    ref, onClose,
    onCancel: (e: React.SyntheticEvent) => { e.preventDefault(); close(); },
    onClick: (e: React.MouseEvent) => { if (e.target === e.currentTarget) close(); },
  };
  // not enumerable → `{...m}` on <dialog> doesn't pass it down as an attribute
  return Object.defineProperty(props, 'close', { value: close, enumerable: false }) as typeof props & { readonly close: () => Promise<void> };
}

export function NoteDialog({ s, kind, onClose }: { s: StudentSummary; kind: 'note' | 'homework'; onClose: () => void }) {
  const m = useModal(onClose);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = useAddStudentNote();
  const flow = useSaveFlow();
  const toast = useToast();
  const label = kind === 'note' ? '給筆記' : '給作業';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) { setErr('請輸入內容。'); return; }
    flow.run(() => save.mutateAsync({ id: s.id, kind, text }), () => { m.close(); toast({ text: kind === 'note' ? `已為 ${s.name} 新增筆記` : `已把作業傳給 ${s.name}` }); })
      .catch((x) => setErr(x instanceof Error ? x.message : '儲存失敗，請再試一次。'));
  };
  return (
    <dialog className="st-dlg" aria-labelledby="st-dlg-t" {...m}>
      <form className="st-dlg-box" onSubmit={submit} noValidate>
        <h2 id="st-dlg-t" className="st-dlg-t">{label} · {s.name}</h2>
        <p className="st-dlg-sub">{kind === 'note' ? '只有你看得到，記下這位學生的狀況或下次要練的重點。' : '學生會收到通知，並在自己的頁面看到這份作業。'}</p>
        <label className="sr-only" htmlFor="st-dlg-text">{label}內容</label>
        <textarea id="st-dlg-text" className="input st-dlg-text" rows={5} maxLength={1000} value={text} autoFocus
          onChange={(e) => { setText(e.target.value); setErr(null); }}
          placeholder={kind === 'note' ? '例如：換聲區還不穩，下次先做唇顫音暖身。' : '例如：每天唱〈小星星〉三次，注意換氣點，錄音傳給老師。'}
          aria-invalid={!!err || undefined} aria-describedby="st-dlg-hint" />
        <p id="st-dlg-hint" className={err ? 'st-dlg-err' : 'st-dlg-count'}>{err ?? `${text.length} / 1000`}</p>
        <div className="st-dlg-acts">
          <button type="button" className="st-btn ghost" disabled={flow.busy} onClick={m.close}>取消</button>
          <SaveButton state={flow.state} className="st-btn dark" label={kind === 'note' ? '儲存筆記' : '傳送作業'} />
        </div>
      </form>
    </dialog>
  );
}

function DisableDialog({ s, onClose }: { s: StudentSummary; onClose: () => void }) {
  const m = useModal(onClose);
  const off = useSetStudentDisabled();
  const toast = useToast();
  return (
    <dialog className="st-dlg" aria-labelledby="st-off-t" aria-describedby="st-off-d" {...m}>
      <div className="st-dlg-box">
        <span className="st-dlg-ic" aria-hidden="true"><Icon name="ban" size={26} /></span>
        <h2 id="st-off-t" className="st-dlg-t">停用 {s.name}？</h2>
        <p id="st-off-d" className="st-dlg-sub">停用後學生不能再預約新的課。已預約的課、堂數和所有紀錄都會保留，之後可以隨時重新啟用。</p>
        <div className="st-dlg-acts">
          <button type="button" className="st-btn ghost" autoFocus onClick={m.close}>返回</button>
          <button type="button" className="st-btn red" disabled={off.isPending}
            onClick={() => off.mutate({ id: s.id, disabled: true }, { onSuccess: () => { toast({ text: `已停用 ${s.name}` }); m.close(); } })}>
            {off.isPending ? '停用中…' : '停用'}</button>
        </div>
      </div>
    </dialog>
  );
}
