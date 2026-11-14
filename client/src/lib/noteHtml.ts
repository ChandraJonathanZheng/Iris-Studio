// 課堂筆記 rich text: the same allow-list as the server (Services/NoteHtml.cs). The server is the real guard; this
// runs before showing a note too (defence in depth) and in the mock, which has no server.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'P', 'BR', 'DIV']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE']);

export function cleanNoteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (el: Element): string =>
    [...el.childNodes].map((n) => {
      if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
      if (n.nodeType !== Node.ELEMENT_NODE) return '';
      const e = n as Element, tag = e.tagName;
      if (DROP.has(tag)) return '';
      const inner = walk(e);
      if (!ALLOWED.has(tag)) return inner; // unknown tag: keep the text, lose the tag
      const t = tag.toLowerCase();
      return t === 'br' ? '<br>' : `<${t}>${inner}</${t}>`; // attributes never survive
    }).join('');
  return walk(doc.body.firstElementChild!).trim();
}

export const noteHtmlText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
