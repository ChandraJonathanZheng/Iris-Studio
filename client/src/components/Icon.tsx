// Icons: Phosphor (phosphoricons.com) via @phosphor-icons/react.
// Pages keep using <Icon name="calendar" /> — the name → Phosphor mapping lives only here, so swapping a glyph
// (or the whole icon set) is a one-line change instead of a hunt through every page.
// Named imports only: Vite tree-shakes the rest of the ~1,500 icons out of the bundle.
import {
  ArrowCounterClockwise, ArrowRight, Bell, CalendarBlank, CalendarPlus, CaretDown, CaretLeft, CaretRight, ChatCircleDots, Check, Clock, DotsThree, EnvelopeSimple,
  Eye, EyeSlash, GearSix, House, Image, InstagramLogo, Info, Warning, MagnifyingGlass, Microphone, Minus, MusicNotes, Package, Pause, Play, SkipBack, SkipForward,
  Plus, Receipt, Repeat, BookOpen, ShieldCheck, PlayCircle, PencilSimple, NotePencil, ClipboardText, Prohibit, UserCircle, IdentificationCard, Notebook, ListBullets, Camera, CaretDoubleLeft, CaretDoubleRight, ArrowArcLeft, SignOut, Sparkle, Star, Trash, Tray, UploadSimple, User, Users, X,
  type Icon as PhosphorIcon, type IconWeight,
} from '@phosphor-icons/react';

const ICONS = {
  home: House, book: CalendarPlus, calendar: CalendarBlank, bell: Bell, user: User, users: Users, inbox: Tray,
  receipt: Receipt, msg: ChatCircleDots, chev: CaretRight, chevDown: CaretDown, back: CaretLeft, more: DotsThree, repeat: Repeat,
  check: Check, x: X, upload: UploadSimple, search: MagnifyingGlass, arrow: ArrowRight, info: Info, warning: Warning, image: Image, instagram: InstagramLogo,
  shield: ShieldCheck, reel: PlayCircle, lessons: BookOpen, edit: PencilSimple, note: NotePencil, homework: ClipboardText, ban: Prohibit, profile: UserCircle, idCard: IdentificationCard, notebook: Notebook, list: ListBullets, camera: Camera, first: CaretDoubleLeft, last: CaretDoubleRight, restore: ArrowArcLeft,
  undo: ArrowCounterClockwise, minus: Minus, plus: Plus, trash: Trash, gear: GearSix, mail: EnvelopeSimple, clock: Clock, mic: Microphone, music: MusicNotes,
  star: Star, eye: Eye, eyeOff: EyeSlash, logout: SignOut, play: Play, pause: Pause, skipBack: SkipBack, skipFwd: SkipForward, sparkle: Sparkle, pkg: Package,
} satisfies Record<string, PhosphorIcon>;

/** 改時間: a clock inside two circling arrows (drawn from the studio's reference icon). Same 256 grid + round strokes as Phosphor. */
function Reschedule({ size = 20, weight = 'regular', ...rest }: { size?: number; weight?: IconWeight } & Record<string, unknown>) {
  const sw = weight === 'bold' ? 26 : weight === 'light' ? 14 : 19; // ÷0.86 so the drawn line matches Phosphor's 16
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <g transform="translate(128 128) scale(.86) translate(-128 -128)">
      <path d="M222 92A100 100 0 0 0 30 120" />
      <path d="M10 104l20 20 20-20" />
      <path d="M34 160A100 100 0 0 0 226 136" />
      <path d="M206 152l20-20 20 20" />
      <path d="M128 52v74l36 36" />
      </g>
    </svg>
  );
}
/** LINE: a speech bubble with the word inside (generic drawing, no brand artwork) */
function LineMark({ size = 20, ...rest }: { size?: number; weight?: IconWeight } & Record<string, unknown>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...rest}>
      <path d="M12 3C6.8 3 2.6 6.4 2.6 10.6c0 3.7 3.3 6.8 7.8 7.5.3.1.7.2.8.5.1.3 0 .7 0 1l-.1.8c0 .2-.2.9.8.5s5.4-3.2 7.4-5.5c1.4-1.5 2-3.1 2-4.8C21.4 6.4 17.2 3 12 3z" fill="currentColor" />
      <text x="12" y="12.9" textAnchor="middle" fontSize="5.6" fontWeight="800" fontFamily="Arial, sans-serif" fill="#FFFFFF">LINE</text>
    </svg>
  );
}
/**
 * → with a longer tail: Phosphor's ArrowRight geometry (256 grid, stroke 16, round caps), shaft drawn from x=14.4
 * instead of 40. At the 20 px size that is 25.6 units ≈ 2 px more tail; the head is untouched.
 */
function ArrowLong({ size = 20, weight = 'regular', ...rest }: { size?: number; weight?: IconWeight } & Record<string, unknown>) {
  const sw = weight === 'bold' ? 24 : weight === 'light' ? 12 : 16;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <line x1="14.4" y1="128" x2="216" y2="128" />
      <polyline points="144 56 216 128 144 200" />
    </svg>
  );
}
const CUSTOM = { reschedule: Reschedule, line: LineMark, arrowLong: ArrowLong } as const;

export type IconName = keyof typeof ICONS | keyof typeof CUSTOM;

/**
 * weight: "regular" everywhere by default (the calm outline look of the Guidebook);
 * "fill" marks the active tab in the navigation; "bold" for tiny glyphs that must stay legible (e.g. ✓ in 12px dots).
 */
export function Icon({ name, size = 20, label, weight = 'regular' }: { name: IconName | string; size?: number; label?: string; weight?: IconWeight }) {
  const Glyph = (CUSTOM as Record<string, typeof Reschedule>)[name] ?? ICONS[name as keyof typeof ICONS] ?? Info;
  return <Glyph size={size} weight={weight} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} />;
}
