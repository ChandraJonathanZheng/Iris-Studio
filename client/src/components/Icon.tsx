// Icons: Phosphor via @phosphor-icons/react. The name → glyph map lives only here (DESIGN-SYSTEM §7).
import {
  ArrowRight, ArrowSquareOut, Bell, CalendarBlank, CalendarPlus, CaretLeft, CaretRight, ChatCircleDots, Check, Clock, DotsSixVertical, DotsThree, EnvelopeSimple,
  Eye, EyeSlash, GearSix, House, Image, Info, InstagramLogo, LockSimple, MagnifyingGlass, Microphone, Minus, MusicNotes, Package, Pause, PencilSimple, Play,
  Plus, Receipt, Repeat, SignOut, Sparkle, Star, Trash, Tray, UploadSimple, User, Users, X,
  type Icon as PhosphorIcon, type IconWeight,
} from '@phosphor-icons/react';

const ICONS = {
  home: House, book: CalendarPlus, calendar: CalendarBlank, bell: Bell, user: User, users: Users, inbox: Tray,
  receipt: Receipt, msg: ChatCircleDots, chev: CaretRight, back: CaretLeft, more: DotsThree, repeat: Repeat,
  check: Check, x: X, upload: UploadSimple, search: MagnifyingGlass, arrow: ArrowRight, info: Info, image: Image,
  minus: Minus, plus: Plus, trash: Trash, gear: GearSix, mail: EnvelopeSimple, clock: Clock, mic: Microphone, music: MusicNotes,
  star: Star, eye: Eye, eyeOff: EyeSlash, logout: SignOut, play: Play, pause: Pause, sparkle: Sparkle, pkg: Package, lock: LockSimple,
  edit: PencilSimple, drag: DotsSixVertical, ig: InstagramLogo, external: ArrowSquareOut,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

/** Decorative unless `label` is given. weight: regular by default, fill = active tab, bold = tiny ✓ marks. */
export function Icon({ name, size = 20, label, weight = 'regular' }: { name: IconName; size?: number; label?: string; weight?: IconWeight }) {
  const G = ICONS[name];
  return <G size={size} weight={weight} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} />;
}
