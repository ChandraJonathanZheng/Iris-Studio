// 課堂筆記 — opened from the notebook icon in 今天的課.
// No note yet → choose 1. 輸入文字 (default) or 2. 上傳截圖, then save.
// Has a note → preview it; the trash icon clears the preview *locally* (nothing is sent), so Iris can redo it. The old
// note stays on the server until she saves the new one: closing the dialog halfway never loses her note.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { SaveButton, useSaveFlow } from './SaveButton';
import { useModal } from './StudentTable';
import { useToast } from './Toast';
import { fmtMD } from '../lib/date';
import { cleanNoteHtml, noteHtmlText } from '../lib/noteHtml';
import { useLessonNote, useSaveLessonNote } from '../lib/queries';
import type { Lesson, LessonNoteKind } from '../lib/types';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function LessonNoteDialog({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const m = useModal(onClose);
  const q = useLessonNote(lesson.id);
  const save = useSaveLessonNote(lesson.id);
  const flow = useSaveFlow();
  const toast = useToast();
  const [cleared, setCleared] = useState(false); // local delete: hide the preview, don't touch the server
  const [mode, setMode] = useState<LessonNoteKind>('text');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]); // free the local preview

  const note = q.data ?? null;
  const viewing = !!note && !cleared;
  const when = `${fmtMD(lesson.date)} ${lesson.time}`;

  const pick = (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) { setErr('只接受 JPG、PNG 或 WEBP 圖片。'); return; }
    if (f.size > MAX_BYTES) { setErr('圖片不能超過 5 MB。'); return; }
    setFile(f);
  };
  const fmt = (cmd: 'bold' | 'italic' | 'underline' | 'insertUnorderedList') => { document.execCommand(cmd); editor.current?.focus(); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let body: { kind: 'text'; html: string } | { kind: 'image'; file: File };
    if (mode === 'text') {
      const html = cleanNoteHtml(editor.current?.innerHTML ?? '');
      if (!noteHtmlText(html)) { setErr('請輸入筆記內容。'); editor.current?.focus(); return; }
      body = { kind: 'text', html };
    } else {
      if (!file) { setErr('請選擇一張截圖。'); return; }
      body = { kind: 'image', file };
    }
    flow.run(() => save.mutateAsync(body), () => { toast({ text: `已儲存${lesson.studentName}的課堂筆記` }); m.close(); })
      .catch((x) => setErr(x instanceof Error ? x.message : '儲存失敗，請再試一次。'));
  };

  return (
    <dialog className="st-dlg ln-dlg" aria-labelledby="ln-t" {...m}>
      <form className="st-dlg-box ln-box" onSubmit={submit} noValidate>
        <header className="ln-head">
          <span className="ln-ic" aria-hidden="true"><Icon name="notebook" size={22} /></span>
          <div>
            <h2 id="ln-t" className="st-dlg-t">課堂筆記</h2>
            <p className="st-dlg-sub">{lesson.studentName} · {when}</p>
          </div>
          <button type="button" className="ln-x" aria-label="關閉" onClick={m.close}><Icon name="x" size={20} /></button>
        </header>

        {q.isPending ? <div className="ln-load" aria-busy="true">載入中…</div>
          : q.isError ? <p className="st-dlg-err" role="alert">{(q.error as Error).message} <button type="button" className="ln-link" onClick={() => q.refetch()}>再試一次</button></p>
          : viewing ? (
            <section className="ln-view" aria-label="目前的筆記">
              <div className="ln-view-bar">
                <span className="ln-kind">{note.kind === 'text' ? '文字筆記' : '截圖'}</span>
                <button type="button" className="ln-del" aria-label="刪除這份筆記，重新輸入或上傳"
                  onClick={() => { setCleared(true); setMode(note.kind); setFile(null); setEmpty(true); }}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
              {note.kind === 'text'
                ? <div className="ln-rich" dangerouslySetInnerHTML={{ __html: cleanNoteHtml(note.html ?? '') }} />
                : <figure className="ln-fig">
                    <img src={note.imageUrl ?? ''} alt={`${lesson.studentName} ${when} 的課堂筆記截圖`} width={note.width ?? undefined} height={note.height ?? undefined}
                      style={note.lqip ? { backgroundImage: `url(${note.lqip})` } : undefined} />
                    <figcaption>{note.fileName}</figcaption>
                  </figure>}
            </section>
          ) : (
            <>
              {cleared && <p className="ln-hint" role="status">已從畫面移除。原本的筆記會保留到你儲存新的內容為止。</p>}
              <fieldset className="ln-mode">
                <legend className="sr-only">筆記類型</legend>
                {([['text', '輸入文字', 'note'], ['image', '上傳截圖', 'image']] as const).map(([k, label, ic]) => (
                  <label key={k} className={`ln-opt${mode === k ? ' is-on' : ''}`}>
                    <input type="radio" name="ln-mode" value={k} checked={mode === k} onChange={() => { setMode(k); setErr(null); }} />
                    <Icon name={ic} size={18} />{label}
                  </label>
                ))}
              </fieldset>

              {mode === 'text' ? (
                <div className="ln-editor">
                  <div className="ln-tools" role="toolbar" aria-label="文字格式">
                    {([['bold', 'B', '粗體'], ['italic', 'I', '斜體'], ['underline', 'U', '底線']] as const).map(([c, t, l]) => (
                      <button key={c} type="button" className={`ln-tool is-${c}`} aria-label={l} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt(c)}>{t}</button>
                    ))}
                    <button type="button" className="ln-tool" aria-label="項目清單" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('insertUnorderedList')}><Icon name="list" size={18} /></button>
                  </div>
                  <div ref={editor} className={`ln-area${empty ? ' is-empty' : ''}`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
                    aria-label="筆記內容" aria-invalid={!!err || undefined} data-ph="例如：今天練了換聲區，下次先做唇顫音暖身。"
                    onInput={(e) => { setEmpty(!e.currentTarget.textContent?.trim()); setErr(null); }} />
                </div>
              ) : (
                <div className="ln-up">
                  {preview ? (
                    <figure className="ln-fig">
                      <img src={preview} alt="準備上傳的截圖" />
                      <figcaption>{file!.name} · {(file!.size / 1024 / 1024).toFixed(1)} MB
                        <button type="button" className="ln-link" onClick={() => setFile(null)}>換一張</button></figcaption>
                    </figure>
                  ) : (
                    <label className="ln-drop">
                      <input type="file" accept={TYPES.join(',')} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
                      <Icon name="upload" size={26} />
                      <span className="ln-drop-t">選擇截圖</span>
                      <span className="ln-drop-s">JPG、PNG 或 WEBP，5 MB 以內 · 會自動轉成 WebP</span>
                    </label>
                  )}
                </div>
              )}
              {err && <p className="st-dlg-err" role="alert">{err}</p>}
              <div className="st-dlg-acts">
                <button type="button" className="st-btn ghost" disabled={flow.busy} onClick={m.close}>取消</button>
                <SaveButton state={flow.state} className="st-btn dark" label={mode === 'text' ? '儲存筆記' : '上傳截圖'} />
              </div>
            </>
          )}
      </form>
    </dialog>
  );
}
