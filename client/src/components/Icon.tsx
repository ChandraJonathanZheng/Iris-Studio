// Icons: Phosphor via @phosphor-icons/react. The name → glyph map lives only here (DESIGN-SYSTEM §7).
import {
  ArrowRight, ArrowSquareOut, Bell, CalendarBlank, CalendarPlus, CaretDown, CaretLeft, CaretRight, ChatCircleDots, Check, Clock, DotsSixVertical, DotsThree, EnvelopeSimple,
  Eye, EyeSlash, GearSix, House, Image, Info, InstagramLogo, LockSimple, MagnifyingGlass, Microphone, Minus, MusicNotes, Package, Pause, PencilSimple, Play,
  Plus, Receipt, Repeat, SignOut, Sparkle, Star, Trash, Tray, UploadSimple, User, Users, Warning, X,
  type Icon as PhosphorIcon, type IconWeight,
} from '@phosphor-icons/react';

const ICONS = {
  home: House, book: CalendarPlus, calendar: CalendarBlank, bell: Bell, user: User, users: Users, inbox: Tray,
  receipt: Receipt, msg: ChatCircleDots, chev: CaretRight, chevDown: CaretDown, back: CaretLeft, more: DotsThree, repeat: Repeat,
  check: Check, x: X, upload: UploadSimple, search: MagnifyingGlass, arrow: ArrowRight, info: Info, warning: Warning, image: Image,
  minus: Minus, plus: Plus, trash: Trash, gear: GearSix, mail: EnvelopeSimple, clock: Clock, mic: Microphone, music: MusicNotes,
  star: Star, eye: Eye, eyeOff: EyeSlash, logout: SignOut, play: Play, pause: Pause, sparkle: Sparkle, pkg: Package, lock: LockSimple,
  edit: PencilSimple, drag: DotsSixVertical, ig: InstagramLogo, external: ArrowSquareOut,
} satisfies Record<string, PhosphorIcon>;

/** 改時間 glyph: two arrows around a clock hand (Phosphor has no such icon). Drawn on the same 256 grid. */
function Reschedule({ size = 20, weight = 'regular', ...rest }: { size?: number; weight?: IconWeight } & React.SVGProps<SVGSVGElement>) {
  const stroke = weight === 'bold' ? 26 : weight === 'light' ? 14 : 19;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <g transform="translate(128 128) scale(.86) translate(-128 -128)">
        <path d="M222 92A100 100 0 0 0 30 120" /><path d="M10 104l20 20 20-20" />
        <path d="M34 160A100 100 0 0 0 226 136" /><path d="M206 152l20-20 20 20" /><path d="M128 52v74l36 36" />
      </g>
    </svg>
  );
}

export type IconName = keyof typeof ICONS | 'reschedule';

/** Decorative unless `label` is given. weight: regular by default, fill = active tab, bold = tiny ✓ marks. */
export function Icon({ name, size = 20, label, weight = 'regular' }: { name: IconName; size?: number; label?: string; weight?: IconWeight }) {
  const a11y = { 'aria-hidden': label ? undefined : true, 'aria-label': label, role: label ? 'img' : undefined } as const;
  if (name === 'reschedule') return <Reschedule size={size} weight={weight} {...a11y} />;
  const G = ICONS[name];
  return <G size={size} weight={weight} {...a11y} />;
}
