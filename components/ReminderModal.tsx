'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'

export interface ReminderModalProps {
  studentNames: string[]
  totalCents: number
  onSend: (tone: 'warm' | 'plain' | 'firm') => void
  onClose: () => void
}

const TONE_MESSAGE: Record<'warm' | 'plain' | 'firm', string> = {
  warm: "Hi! Just a gentle nudge — your child's tuition is still open. Thank you! — Iris",
  plain: 'Reminder: tuition payment for this cycle is still outstanding.',
  firm: 'Please settle the outstanding tuition balance as soon as possible.',
}

export default function ReminderModal({ studentNames, totalCents, onSend, onClose }: ReminderModalProps) {
  const [tone, setTone] = useState<'warm' | 'plain' | 'firm'>('warm')

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full max-w-[480px] mx-auto rounded-t-3xl bg-cream p-6">
        <h2 className="text-xl font-extrabold">Nudge {studentNames.length} parents on WhatsApp</h2>
        <p className="mt-1 text-sm text-black/50">{studentNames.join(', ')}</p>

        <div className="mt-5 rounded-2xl bg-lime/30 p-5 text-sm">{TONE_MESSAGE[tone]}</div>

        <div className="mt-4 flex gap-2">
          {(['warm', 'plain', 'firm'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={`flex-1 rounded-full py-3 text-sm font-bold capitalize ${
                tone === t ? 'bg-ink text-white' : 'bg-white text-black/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-white py-4 font-bold"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => onSend(tone)}
            className="flex-1 rounded-full bg-ink py-4 font-bold text-white"
          >
            Send {studentNames.length} reminders
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-black/30">{formatCurrency(totalCents)} total</p>
      </div>
    </div>
  )
}
