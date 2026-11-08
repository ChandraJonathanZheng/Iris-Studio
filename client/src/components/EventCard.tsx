import { useState } from 'react';
import { Photo } from './ui';

export interface StudioEvent {
  title: string;
  date: string;
  place: string;
  summary: string;
  /** 7 photos: [0] starts as the large one, the rest fill the 3 × 2 thumbnail grid */
  photos: { caption: string; src?: string; lqip?: string }[];
}

/**
 * One event = one card. Large photo on the left, 6 thumbnails (3 × 2) on the right.
 * Tapping a thumbnail swaps it into the large frame, so all 7 photos can be seen without a lightbox.
 */
export function EventCard({ ev }: { ev: StudioEvent }) {
  const [main, setMain] = useState(0);
  const thumbs = ev.photos.map((p, i) => ({ ...p, i })).filter((p) => p.i !== main).slice(0, 6);
  return (
    <article className="card event-card">
      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="stack g1"><h3 className="h3">{ev.title}</h3><p className="caption">{ev.date} · {ev.place}</p></div>
      </div>
      <div className="event-gallery">
        <div className="event-main"><Photo caption={ev.photos[main].caption} src={ev.photos[main].src} lqip={ev.photos[main].lqip} style={{ width: '100%', height: '100%' }} /></div>
        <div className="event-thumbs" role="group" aria-label={`${ev.title} 的照片`}>
          {thumbs.map((p) => (
            <button key={p.i} className="event-thumb" aria-label={`放大第 ${p.i + 1} 張：${p.caption}`} onClick={() => setMain(p.i)}>
              {p.src ? <img src={p.src} alt="" loading="lazy" /> : <span aria-hidden="true">{p.i + 1}</span>}
            </button>
          ))}
        </div>
      </div>
      <p className="caption" style={{ color: 'var(--ink)' }}>{ev.summary}</p>
    </article>
  );
}
