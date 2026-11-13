/* =================== 更多 › IG Reels (teacher): list, sort, delete, add / edit =================== */
import { SaveButton, useSaveFlow } from '../components/SaveButton';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { ErrorCard, ListSkeleton, PageHead } from '../components/ui';
import { REEL_MAX, useDeleteReel, useReorderReels, useSaveReel, useTeacherReels } from '../lib/queries';
import type { Reel } from '../lib/types';

/** Same rules as the server (ReelEndpoints.UrlProblem): https, instagram.com/reel|reels|p/<code>, no CJK characters. */
const IG_REEL_RE = /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(\?[\x21-\x7E]*)?$/;
const CJK_RE = /[　-〿㐀-鿿豈-﫿＀-￯]/;
export function reelUrlProblem(raw: string): string {
  const url = raw.trim();
  if (!url) return 'Reels 連結不能空白。';
  if (CJK_RE.test(url)) return '連結不能有中文字。';
  if (!url.startsWith('https://')) return '連結要用 https:// 開頭。';
  if (!IG_REEL_RE.test(url)) return '請貼上 Instagram Reels 的連結，例如 https://www.instagram.com/reel/ABC123/';
  return '';
}
/** Instagram's Reels cover canvas (9:16). The profile grid shows the centre, so keep faces/text in the middle. */
export const REEL_COVER = { w: 1080, h: 1920 };

/* ---------- list ---------- */
export function ReelsAdmin() {
  const q = useTeacherReels();
  const reorder = useReorderReels();
  const del = useDeleteReel();
  const toast = useToast();
  const [order, setOrder] = useState<Reel[] | null>(null); // local copy while dragging
  const [drag, setDrag] = useState<string | null>(null);
  const [ask, setAsk] = useState<Reel | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const list = order ?? q.data ?? [];
  const full = list.length >= REEL_MAX;

  const commit = (next: Reel[]) => {
    const before = (q.data ?? []).map((r) => r.id).join();
    setOrder(null); setDrag(null);
    if (next.map((r) => r.id).join() !== before)
      reorder.mutate(next.map((r) => r.id), { onSuccess: () => toast({ text: '順序已更新' }), onError: (e) => toast({ text: (e as Error).message, kind: 'error' }) });
  };
  // pointer drag on the ≡ handle (works for mouse and touch): rows swap as the finger passes the middle of the next row
  const onDown = (e: RPointerEvent<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(id); setOrder(list);
  };
  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!drag || !order || !listRef.current) return;
    const rows = Array.from(listRef.current.children) as HTMLElement[];
    const from = order.findIndex((r) => r.id === drag);
    let to = from;
    rows.forEach((row, i) => { const b = row.getBoundingClientRect(); if (e.clientY > b.top && e.clientY < b.bottom) to = i; });
    if (to !== from) { const next = [...order]; const [m] = next.splice(from, 1); next.splice(to, 0, m); setOrder(next.map((r, i) => ({ ...r, sortOrder: i + 1 }))); }
  };
  const onUp = () => { if (drag && order) commit(order); };
  // keyboard: focus the handle, ↑ / ↓ moves the row
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    commit(next.map((r, k) => ({ ...r, sortOrder: k + 1 })));
    window.setTimeout(() => listRef.current?.querySelectorAll<HTMLButtonElement>('.rv-grip')[j]?.focus(), 30);
  };

  return (
    <>
      <Crumbs here="列表頁" />
      <PageHead title="IG Reels" />
      {q.isError ? <ErrorCard error={q.error} retry={() => q.refetch()} /> : !q.data ? <ListSkeleton rows={4} /> : (
        <>
          <div className="rv-top">
            <span className="rv-count">{list.length} / {REEL_MAX} 則</span>
            {full ? <span className="rv-full">已達上限，刪除一則後才能新增</span>
              : <Link to="new" className="rv-add" viewTransition><Icon name="plus" size={16} />新增 Reels</Link>}
          </div>
          {list.length === 0 ? <p className="rv-empty">還沒有 Reels。新增第一則，網站的「精彩片段」就會顯示。</p> : (
            <ol className={`rv-list${drag ? ' is-dragging' : ''}`} ref={listRef} aria-label="IG Reels 排序">
              {list.map((r, i) => (
                <li key={r.id} className={`rv-row${drag === r.id ? ' is-drag' : ''}`}>
                  <button type="button" className="rv-grip" aria-label={`排序：${r.title}，目前第 ${i + 1} 則。用上下方向鍵移動`}
                    onPointerDown={(e) => onDown(e, r.id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={(e) => onKey(e, i)}>
                    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                  <span className="rv-n" aria-hidden="true">{i + 1}</span>
                  {/* instagram.com links are "universal links": on a phone with the app installed they open the IG app, otherwise the browser */}
                  <a className="rv-body" href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`在 Instagram 開啟「${r.title}」（另開新視窗）`}>
                    <span className="rv-t">{r.title}<Icon name="instagram" size={14} /></span>
                    <span className="rv-u">{r.url.replace(/^https:\/\/(www\.)?/, '')}</span>
                  </a>
                  <span className="rv-acts">
                    <Link to={r.id} className="rv-edit" viewTransition aria-label={`編輯 ${r.title}`}>編輯</Link>
                    <button type="button" className="rv-del" onClick={() => setAsk(r)} aria-label={`刪除 ${r.title}`}>刪除</button>
                  </span>
                </li>))}
            </ol>
          )}
        </>
      )}
      {ask && <DeleteReelDialog onCancel={() => setAsk(null)} onConfirm={() => {
        const r = ask; setAsk(null);
        del.mutate(r.id, { onSuccess: () => toast({ text: `已刪除「${r.title}」` }), onError: (e) => toast({ text: (e as Error).message, kind: 'error' }) });
      }} />}
    </>
  );
}

function DeleteReelDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="rv-dlg" aria-labelledby="rv-dlg-t" onClose={onCancel} onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      <p id="rv-dlg-t">你確定要刪除這一則？</p>
      <div className="rv-dlg-acts">
        <button type="button" className="rv-cap ghost" onClick={() => ref.current?.close()} autoFocus>返回</button>
        <button type="button" className="rv-cap red" onClick={onConfirm}>刪除</button>
      </div>
    </dialog>
  );
}

/* ---------- add / edit ---------- */
export function ReelEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const q = useTeacherReels();
  const save = useSaveReel(id);
  const nav = useNavigate();
  const toast = useToast();
  const reel = q.data?.find((r) => r.id === id);
  const [title, setTitle] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [touched, setTouched] = useState({ title: false, url: false });
  const [urlChecked, setUrlChecked] = useState(false);
  const [tried, setTried] = useState(false);
  const flow = useSaveFlow();
  const state = flow.state;
  const [fileErr, setFileErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const t = title ?? reel?.title ?? '';
  const u = url ?? reel?.url ?? '';
  // check the link 600 ms after typing stops (not on every key press)
  useEffect(() => { setUrlChecked(false); if (!u) return; const k = window.setTimeout(() => setUrlChecked(true), 600); return () => window.clearTimeout(k); }, [u]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (q.isError) return <ErrorCard error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <ListSkeleton rows={3} />;
  if (!isNew && !reel) return <><Crumbs here="編輯" list /><PageHead title="編輯 Reels" /><p className="rv-empty">找不到這則 Reels，可能已經被刪除了。</p></>;
  if (isNew && q.data.length >= REEL_MAX && state === 'idle') return <><Crumbs here="新增" list /><PageHead title="新增 Reels" /><p className="rv-empty">已經有 {REEL_MAX} 則 Reels，請先刪除一則再新增。</p></>;

  const order = isNew ? q.data.length + 1 : reel!.sortOrder;
  const titleErr = !t.trim() ? 'IG 自訂標題不能空白。' : t.trim().length > 60 ? '標題最多 60 個字。' : '';
  const urlErr = reelUrlProblem(u);
  const showTitle = (tried || touched.title) && !!titleErr;
  const showUrl = (tried || (touched.url && !!u) || urlChecked) && !!urlErr;
  const shownCover = preview ?? reel?.coverUrl ?? null;

  const pick = (f: File | undefined) => {
    setFileErr('');
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setFileErr('只接受 JPG、PNG 或 WEBP 圖片。'); return; }
    if (f.size > 5 * 1024 * 1024) { setFileErr('封面圖不能超過 5 MB。'); return; }
    setCover(f); setPreview(URL.createObjectURL(f));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (titleErr || urlErr || state !== 'idle') return;
    flow.run(() => save.mutateAsync({ title: t.trim(), url: u.trim(), cover }), () => nav('/teacher/more/reels', { replace: true }))
      .catch((err) => toast({ text: (err as Error).message, kind: 'error' }));
  };

  return (
    <>
      <Crumbs here={isNew ? '新增' : '編輯'} list />
      <PageHead title={isNew ? '新增 Reels' : '編輯 Reels'} />
      <form className="card rv-form" onSubmit={submit} noValidate>
        <div className="rv-field">
          <span className="rv-label">排序號</span>
          <span className="rv-order" aria-describedby="rv-order-h">{order}</span>
          <small id="rv-order-h" className="rv-hint">自動編號；要改順序請在列表拖曳 ≡</small>
        </div>

        <label className="rv-field" htmlFor="rv-title">
          <span className="rv-label">IG 自訂標題<span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></span>
          <input id="rv-title" className="input" value={t} maxLength={60} placeholder="例如：高音練習"
            onChange={(e) => setTitle(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, title: true }))}
            aria-invalid={showTitle} aria-describedby="rv-title-e" />
          {showTitle && <small className="au-err" id="rv-title-e" role="alert">{titleErr}</small>}
        </label>

        <label className="rv-field" htmlFor="rv-url">
          <span className="rv-label">Reels 連結<span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></span>
          <input id="rv-url" className="input" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={u}
            placeholder="https://www.instagram.com/reel/…" onChange={(e) => setUrl(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, url: true }))}
            aria-invalid={showUrl} aria-describedby="rv-url-e" />
          {showUrl && <small className="au-err" id="rv-url-e" role="alert">{urlErr}</small>}
        </label>

        <div className="rv-field">
          <span className="rv-label" id="rv-cover-l">封面圖</span>
          <button type="button" className={`rv-cover${shownCover ? ' has' : ''}`} onClick={() => fileRef.current?.click()} aria-labelledby="rv-cover-l" aria-describedby="rv-cover-h">
            {shownCover ? <img src={shownCover} alt="封面預覽" /> : <span className="rv-cover-empty"><Icon name="image" size={28} /><span>上傳封面圖</span></span>}
            {shownCover && <span className="rv-cover-change">更換</span>}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <small className="rv-hint" id="rv-cover-h">（建議使用 {REEL_COVER.w}px * {REEL_COVER.h}px 尺寸）</small>
          {fileErr && <small className="au-err" role="alert">{fileErr}</small>}
        </div>

        <div className="rv-actions">
          <button type="button" className="rv-cap white" onClick={() => nav(-1)} disabled={state !== 'idle'}>取消</button>
          <SaveButton state={state} className="rv-cap black rv-save" />
        </div>
      </form>
    </>
  );
}

/** 設定 / 列表頁 / 編輯 — 設定 goes back to 更多 (the settings menu); 列表頁 is a link only on the edit page. */
function Crumbs({ here, list }: { here: string; list?: boolean }) {
  return (
    <nav className="rv-crumbs" aria-label="麵包屑">
      <ol>
        <li><Link to="/teacher/more" viewTransition>設定</Link></li>
        {list ? <li><Link to="/teacher/more/reels" viewTransition>列表頁</Link></li> : null}
        <li aria-current="page">{here}</li>
      </ol>
    </nav>
  );
}
