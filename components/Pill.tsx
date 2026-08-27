export interface PillProps {
  children: React.ReactNode
  tone: 'coral' | 'green' | 'neutral' | 'dark'
}

const TONE_CLASSES: Record<PillProps['tone'], string> = {
  coral: 'bg-coral/20 text-coral',
  green: 'bg-lime/30 text-green-800',
  neutral: 'bg-black/5 text-black/60',
  dark: 'bg-ink text-white',
}

export default function Pill({ children, tone }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
