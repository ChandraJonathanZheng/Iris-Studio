import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Empty, ErrorCard, ListSkeleton, PageHead, Tag } from '../components/ui';
import { ApiError } from '../lib/api';
import { useDeleteReel, useReels, useReorderReels, useSaveReel } from '../lib/queries';
import { MAX_REELS, reelShortcode, thumbError, THUMB_TYPES } from '../lib/reels';
import type { Reel } from '../lib/types';

/*
 * 網站精彩片段 — Iris picks up to 8 Instagram Reels for the website's 精彩片段 row.
 * List: drag ⠿ (or focus it and press ↑ ↓) to reorder · ✎ edit · 🗑 delete (soft delete → 復原 in the toast).
 * Add / edit are route sheets (/teacher/reels/new, /teacher/reels/:id/edit), so the phone back gesture closes them.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : '發生錯誤，請稍後再試。');
const label = (r: Pick<Reel, 'shortcode'>) => `Reel · ${r.shortcode}`;

export function ReelsPage() {
  const q = useReels();
  const list = q.data ?? [];
  const full = list.length >= MAX_REELS;

  return (
    <>
      <PageHead title="網站精彩片段" back
        right={full
          ? <span className="btn primary sm" aria-disabled="true" title="最多 8 支，請先刪除一支"><Icon name="plus" size={18} />新增</span>
          : <Link className="btn primary sm" to="new" viewTransition><Icon name="plus" size={18} />新增</Link>} />
      <p className="rla-intro">官網「精彩片段」會照這個順序顯示。拖曳 <Icon name="drag" size={16} label="拖曳把手" /> 可以調整順序，最多 {MAX_REELS} 支。</p>

      {q.isPending ? <ListSkeleton rows={3} /> : q.isError ? <ErrorCard error={q.error} retry={q.refetch} /> : (
        <section className="rla-card" aria-labelledby="rla-h">
          <header className="rla-head">
            <h2 className="rla-h" id="rla-h">Instagram Reels</h2>
            {/* exceptions speak: only "full" gets a status mark */}
            {full ? <Tag tone="warn">已滿 {MAX_REELS} 支</Tag> : <span className="rla-count">{list.length} / {MAX_REELS} 支</span>}
          </header>
          {list.length === 0
            ? <Empty text="還沒有放任何 Reels。官網會先隱藏「精彩片段」這一區。" action={<Link className="btn secondary sm" to="new">新增第一支 Reels</Link>} />
            : <ReelList reels={list} />}
          {full && <p className="rla-full">◆ 已經放滿 {MAX_REELS} 支。要放新的 Reels，請先刪除一支。</p>}
        </section>
      )}
      <Outlet />
    </>
  );
}

/** Reorder by pointer (mouse + touch, on the handle only) or keyboard (↑ ↓ on the focused handle). */
function ReelList({ reels }: { reels: Reel[] }) {
  const reorder = useReorderReels();
  const { remove, undo } = useDeleteReel();
  const toast = useToast();
  const [draft, setDraft] = useState<string[] | null>(null); // order while dragging (not saved yet)
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const start = useRef({ y: 0, index: 0, step: 1 });
  const listRef = useRef<HTMLOListElement>(null);

  const ids = draft ?? reels.map((r) => r.id);
  const byId = new Map(reels.map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter((r): r is Reel => !!r);

  const save = (next: string[]) => {
    if (next.join() === reels.map((r) => r.id).join()) return; // nothing moved
    reorder.mutate(next, {
      onSuccess: () => toast({ text: '已更新順序，官網會照新的順序顯示' }),
      onError: (e) => toast({ text: errText(e), kind: 'error' }),
    });
  };
  const move = (list: string[], from: number, to: number) => { const n = [...list]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; };

  // ---- pointer drag ----
  const onDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0 || reorder.isPending) return;
    const row = (e.currentTarget.closest('li') as HTMLElement);
    const gap = parseFloat(getComputedStyle(listRef.current!).rowGap) || 0;
    start.current = { y: e.clientY, index: ids.indexOf(id), step: row.getBoundingClientRect().height + gap };
    e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves even when the finger leaves the handle
    setDraft(ids); setDrag({ id, dy: 0 });
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || !draft) return;
    const { y, index, step } = start.current;
    const dy = e.clientY - y;
    const to = Math.max(0, Math.min(draft.length - 1, index + Math.round(dy / step)));
    const from = draft.indexOf(drag.id);
    const next = from === to ? draft : move(draft, from, to);
    // the row follows the finger; the part already "used" by the new position is taken off
    setDraft(next); setDrag({ id: drag.id, dy: dy - (to - index) * step });
  };
  const onUp = () => {
    if (!drag || !draft) return;
    const pos = draft.indexOf(drag.id);
    if (pos !== start.current.index) setAnnounce(`已移到第 ${pos + 1} 個`);
    save(draft);
    setDrag(null); setDraft(null);
  };

  // ---- keyboard: one step per key press, saved right away ----
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const from = ids.indexOf(id);
    const to = e.key === 'ArrowUp' ? from - 1 : e.key === 'ArrowDown' ? from + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -2;
    if (to === -2) return;
    e.preventDefault();
    if (to < 0 || to >= ids.length || to === from || reorder.isPending) return;
    save(move(ids, from, to));
    setAnnounce(`已移到第 ${to + 1} 個，共 ${ids.length} 個`);
    // React moves the <li>; some browsers drop focus when a focused node moves, so put it back
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-handle="${id}"]`)?.focus());
  };

  const onDelete = (r: Reel) => {
    remove.mutate(r.id, {
      onSuccess: () => toast({
        text: `已刪除 ${label(r)}`,
        undo: async () => { await undo.mutateAsync(r.id); toast({ text: '已復原' }); },
      }),
      onError: (e) => toast({ text: errText(e), kind: 'error' }),
    });
  };

  return (
    <>
      <ol className="rla-list" ref={listRef} aria-label="Reels 顯示順序">
        {rows.map((r, i) => (
          <li key={r.id} className={`rla-row${drag?.id === r.id ? ' is-drag' : ''}`}
            style={drag?.id === r.id ? { transform: `translateY(${drag.dy}px)` } : undefined}>
            <button type="button" className="rla-handle" data-handle={r.id}
              aria-label={`調整順序：${label(r)}，第 ${i + 1} 個，共 ${rows.length} 個。按上下方向鍵移動`}
              onPointerDown={(e) => onDown(e, r.id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onKeyDown={(e) => onKey(e, r.id)}>
              <Icon name="drag" size={20} />
            </button>
            <span className="rla-pos" aria-hidden="true">{i + 1}</span>
            <span className="rla-thumb">
              <img src={r.thumbnailUrl} alt="" loading="lazy" draggable={false}
                style={r.lqip ? { backgroundImage: `url("${r.lqip}")` } : undefined} />
            </span>
            <span className="rla-body">
              <span className="rla-t">{label(r)}</span>
              <a className="rla-link" href={r.url} target="_blank" rel="noopener noreferrer">
                <span className="sr">在 </span>Instagram<Icon name="external" size={14} /><span className="sr"> 開啟（另開視窗）</span></a>
            </span>
            <span className="rla-acts">
              <Link className="iconbtn rla-ib" to={`${r.id}/edit`} aria-label={`編輯 ${label(r)}`} viewTransition><Icon name="edit" size={18} /></Link>
              <button type="button" className="iconbtn rla-ib danger" aria-label={`刪除 ${label(r)}`} disabled={remove.isPending}
                onClick={() => onDelete(r)}><Icon name="trash" size={18} /></button>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr" aria-live="polite">{announce}</p>
    </>
  );
}

/* =================== 新增 / 編輯 sheet =================== */

export function NewReelSheet() {
  const q = useReels();
  if (q.data && q.data.length >= MAX_REELS) {
    // deep link to /new while the list is full
    return <RouteSheet title="新增 Reels"><p className="rla-full">◆ 已經放滿 {MAX_REELS} 支。請先刪除一支，再新增。</p></RouteSheet>;
  }
  return <ReelForm key="new" others={q.data ?? []} />;
}

export function EditReelSheet() {
  const { id } = useParams();
  const q = useReels();
  if (q.isPending) return <RouteSheet title="編輯 Reels"><ListSkeleton rows={1} /></RouteSheet>;
  const reel = q.data?.find((r) => r.id === id);
  if (!reel) return <RouteSheet title="編輯 Reels"><p className="err">找不到這支 Reels，可能已被刪除。</p></RouteSheet>;
  return <ReelForm key={reel.id} reel={reel} others={(q.data ?? []).filter((r) => r.id !== reel.id)} />;
}

function ReelForm({ reel, others }: { reel?: Reel; others: Reel[] }) {
  const save = useSaveReel();
  const toast = useToast();
  const nav = useNavigate();
  const close = useSheetClose('/teacher/reels');
  const [url, setUrl] = useState(reel?.url ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ url?: string; file?: string }>({});
  const [checked, setChecked] = useState(!!reel); // show link feedback only after typing stops (0.6 s)
  const [over, setOver] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);

  // Object URLs keep the file in memory until revoked → revoke when the file changes or the sheet closes.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => { if (checked) return; const t = window.setTimeout(() => setChecked(true), 600); return () => window.clearTimeout(t); }, [url, checked]);

  const code = reelShortcode(url);
  const linkError = (): string | undefined => {
    if (!url.trim()) return 'Instagram 連結不能空白。';
    if (!code) return '這不是 Instagram Reels 連結。請在 Reels 按「分享 → 複製連結」再貼上。';
    if (others.some((r) => r.shortcode === code)) return '這支 Reels 已經在列表裡了。';
    return undefined;
  };
  const liveUrlError = checked && url.trim() ? linkError() : errors.url;
  const dirty = !reel || !!file || code !== reel.shortcode;

  const pick = (f?: File | null) => {
    if (!f) return;
    const e = thumbError(f);
    setErrors((x) => ({ ...x, file: e ?? undefined }));
    if (!e) setFile(f);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { url: linkError(), file: !reel && !file ? '請選擇封面圖片。' : errors.file };
    setErrors(next); setChecked(true);
    if (next.url) { urlRef.current?.focus(); return; }
    if (next.file) { pickRef.current?.focus(); return; }
    if (!dirty) return;
    save.mutate({ id: reel?.id, url, thumbnail: file }, {
      onSuccess: (r) => { toast({ text: reel ? `已儲存 ${label(r)}` : `已新增 ${label(r)}，官網排在第 ${others.length + 1} 個` }); close(); },
      onError: (er) => {
        // put server errors under the right field when we know which one it is
        const c = er instanceof ApiError ? er.code : '';
        if (c === 'bad_link' || c === 'duplicate') { setErrors((x) => ({ ...x, url: er.message })); setChecked(false); urlRef.current?.focus(); }
        else if (c === 'too_large' || c === 'bad_image') { setErrors((x) => ({ ...x, file: er.message })); pickRef.current?.focus(); }
        else toast({ text: errText(er), kind: 'error' });
      },
    });
  };

  const shown = preview ?? reel?.thumbnailUrl ?? null;
  return (
    <RouteSheet title={reel ? '編輯 Reels' : '新增 Reels'} parent="/teacher/reels"
      footer={<div className="row rla-foot">
        <button type="button" className="btn secondary" onClick={() => nav(-1)}>取消</button>
        <button type="submit" form="rla-form" className="btn primary wide" disabled={save.isPending || !dirty}>
          {save.isPending ? '處理中…' : reel ? '儲存' : '新增'}</button>
      </div>}>
      <form id="rla-form" className="rla-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="rla-url">Instagram 連結<span className="req" aria-hidden="true"> *</span></label>
          <input id="rla-url" ref={urlRef} className="input" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
            placeholder="https://www.instagram.com/reel/ABC123xyz/" value={url} required maxLength={300}
            onChange={(e) => { setUrl(e.target.value); setChecked(false); setErrors((x) => ({ ...x, url: undefined })); }}
            onBlur={() => setChecked(true)}
            aria-invalid={!!liveUrlError || undefined} aria-describedby="rla-url-msg" />
          <span id="rla-url-msg" className={liveUrlError ? 'err' : code ? 'hint ok' : 'hint'}>
            {liveUrlError ?? (code ? <>✓ 找到 Reel · {code}　<a href={`https://www.instagram.com/reel/${code}/`} target="_blank" rel="noopener noreferrer">先看看 ↗</a></>
              : '在 Instagram 的 Reels 按「分享 → 複製連結」，貼在這裡。')}
          </span>
        </div>

        <div className="field">
          <span className="label" id="rla-file-l">封面圖片{!reel && <span className="req" aria-hidden="true"> *</span>}</span>
          <div className={`rla-drop${over ? ' is-over' : ''}${errors.file ? ' is-bad' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <span className="rla-frame" aria-hidden="true">
              {shown ? <img src={shown} alt="" /> : <span className="rla-ph"><Icon name="image" size={26} />9 : 16</span>}
              {shown && <><span className="rla-play"><Icon name="play" size={18} weight="fill" /></span><span className="rla-badge"><Icon name="ig" size={13} />Reel</span></>}
            </span>
            <div className="rla-drop-text">
              <input ref={fileRef} type="file" accept={THUMB_TYPES.join(',')} className="sr" tabIndex={-1} aria-hidden="true"
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              <button ref={pickRef} type="button" className="btn secondary sm" aria-labelledby="rla-file-l rla-pick-t" aria-describedby="rla-file-msg"
                aria-invalid={!!errors.file || undefined} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={18} /><span id="rla-pick-t">{shown ? '更換圖片' : '選擇圖片'}</span></button>
              {file && <p className="rla-file-name">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
              <span id="rla-file-msg" className={errors.file ? 'err' : 'hint'}>
                {errors.file ?? <>JPG、PNG 或 WEBP，5 MB 以內。<br />建議直式 9 : 16（例如 1080 × 1920）。{reel && !file && <><br />不換的話會保留目前的封面。</>}</>}
              </span>
            </div>
          </div>
        </div>
        {reel && !dirty && <p className="hint">還沒有變更。</p>}
      </form>
    </RouteSheet>
  );
}
