import { formatCurrency } from '@/lib/format'

export interface FeesSelectionBarProps {
  count: number
  totalCents: number
  onRemind: () => void
}

export default function FeesSelectionBar({ count, totalCents, onRemind }: FeesSelectionBarProps) {
  return (
    <div className="fixed bottom-20 left-1/2 w-full max-w-[440px] -translate-x-1/2 rounded-2xl bg-ink px-5 py-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold">
            {count} selected · {formatCurrency(totalCents)}
          </p>
          <p className="text-xs text-white/50">Sends one WhatsApp each, in your words</p>
        </div>
        <button
          type="button"
          onClick={onRemind}
          className="rounded-full bg-lime px-5 py-2 text-sm font-bold text-ink"
        >
          Remind
        </button>
      </div>
    </div>
  )
}
