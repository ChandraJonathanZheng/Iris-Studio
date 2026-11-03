// Thin outline icons (Lucide-style geometry, 1.75 px stroke, round caps) per Guidebook §2.6.
const P: Record<string, string> = {
  home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18M12 13v5M9.5 15.5h5',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M4 21a8 8 0 0 1 16 0',
  users: 'M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  receipt: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 1V2l-1 1-3-1-3 2-3-2-3 2-3-2zM8 8h8M8 12h8M8 16h5',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14M21 21l-4.3-4.3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18M12 11v5M12 8h.01',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4M21 15l-5-5L5 21',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18M12 7v5l3 2',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 10a7 7 0 0 0 14 0M12 17v5',
  music: 'M9 18V5l12-2v13M6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6M18 13a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sparkle: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
};

export function Icon({ name, size = 20, label }: { name: keyof typeof P | string; size?: number; label?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
    >
      <path d={P[name] ?? P.info} />
    </svg>
  );
}
