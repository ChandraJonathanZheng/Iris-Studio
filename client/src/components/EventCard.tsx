import { useState } from 'react';
import { Photo } from './ui';

export interface StudioEvent { title: string; date: string; photos: string[] }

/** WEB-6: 1 featured photo + 2 thumbnails; 查看更多照片 reveals the rest. Photos are placeholders until real ones arrive. */
export function EventCard({ event }: { event: StudioEvent }) {
  const [all, setAll] = useState(false);
  const [first, ...rest] = event.photos;
  const shown = all ? rest : rest.slice(0, 2);
  return (
    <article className="stack">
      <div><h3 className="sec">{event.title}</h3><p className="cap">{event.date}</p></div>
      <div className="gallery">
        <div className="big"><Photo caption={first} style={{ aspectRatio: '4 / 3', height: '100%' }} /></div>
        {shown.map((p) => <Photo key={p} caption={p} style={{ aspectRatio: '1 / 1' }} />)}
      </div>
      {rest.length > 2 && !all && <button className="btn link" onClick={() => setAll(true)} style={{ alignSelf: 'flex-start' }}>查看更多照片（{event.photos.length}）</button>}
    </article>
  );
}
