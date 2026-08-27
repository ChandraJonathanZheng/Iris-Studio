import type { RescheduleRequest } from '@/lib/types'

export interface RescheduleModalProps {
  request: RescheduleRequest
  studentName: string
  error?: string | null
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  onDismiss: () => void
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function RescheduleModal({ request, studentName, error, onApprove, onDecline, onDismiss }: RescheduleModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="mx-auto w-full max-w-[480px] rounded-t-3xl bg-cream p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold">{studentName}</h2>
          </div>
          <div className="text-right text-xs uppercase tracking-wide text-black/40">
            Current class
            <p className="text-sm font-bold text-ink">{formatDateTime(request.current_time)}</p>
          </div>
        </div>

        <p className="mt-4 text-xs uppercase tracking-wide text-black/40">Request change below</p>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-white p-5">
          <div>
            <p className="text-xs text-black/40">From</p>
            <p className="font-bold">{formatDateTime(request.current_time)}</p>
          </div>
          <span className="text-plum-light">→</span>
          <div className="text-right">
            <p className="text-xs text-plum-light">To</p>
            <p className="font-bold">{formatDateTime(request.requested_time)}</p>
          </div>
        </div>

        {request.reason && (
          <div className="mt-3 rounded-2xl bg-black/5 p-4 text-sm">
            <p>&ldquo;{request.reason}&rdquo;</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-coral">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onDecline(request.id)}
            className="flex-1 rounded-full bg-white py-4 font-bold"
          >
            Can&apos;t do it
          </button>
          <button
            type="button"
            onClick={() => onApprove(request.id)}
            className="flex-1 rounded-full bg-plum-light py-4 font-bold text-white"
          >
            Approve move
          </button>
        </div>
        <button type="button" onClick={onDismiss} className="mt-3 w-full text-center text-sm text-black/40">
          Decide later
        </button>
      </div>
    </div>
  )
}
