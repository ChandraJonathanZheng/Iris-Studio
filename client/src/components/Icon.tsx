// Icons: Phosphor (phosphoricons.com) via @phosphor-icons/react.
// Pages keep using <Icon name="calendar" /> — the name → Phosphor mapping lives only here, so swapping a glyph
// (or the whole icon set) is a one-line change instead of a hunt through every page.
// Named imports only: Vite tree-shakes the rest of the ~1,500 icons out of the bundle.
import {
  ArrowRight, Bell, CalendarBlank, CalendarPlus, CaretLeft, CaretRight, ChatCircleDots, Check, Clock, DotsThree, EnvelopeSimple,
  Eye, EyeSlash, GearSix, House, Image, Info, MagnifyingGlass, Microphone, Minus, MusicNotes, Package, Pause, Play,
  Plus, Receipt, Repeat, SignOut, Sparkle, Star, Trash, Tray, UploadSimple, User, Users, X,
  type Icon as PhosphorIcon, type IconWeight,
} from '@phosphor-icons/react';

const ICONS = {
  home: House, book: CalendarPlus, calendar: CalendarBlank, bell: Bell, user: User, users: Users, inbox: Tray,
  receipt: Receipt, msg: ChatCircleDots, chev: CaretRight, back: CaretLeft, more: DotsThree, repeat: Repeat,
  check: Check, x: X, upload: UploadSimple, search: MagnifyingGlass, arrow: ArrowRight, info: Info, image: Image,
  minus: Minus, plus: Plus, trash: Trash, gear: GearSix, mail: EnvelopeSimple, clock: Clock, mic: Microphone, music: MusicNotes,
  star: Star, eye: Eye, eyeOff: EyeSlash, logout: SignOut, play: Play, pause: Pause, sparkle: Sparkle, pkg: Package,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

/**
 * weight: "regular" everywhere by default (the calm outline look of the Guidebook);
 * "fill" marks the active tab in the navigation; "bold" for tiny glyphs that must stay legible (e.g. ✓ in 12px dots).
 */
export function Icon({ name, size = 20, label, weight = 'regular' }: { name: IconName | string; size?: number; label?: string; weight?: IconWeight }) {
  const Glyph = ICONS[name as IconName] ?? Info;
  return <Glyph size={size} weight={weight} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} />;
}
