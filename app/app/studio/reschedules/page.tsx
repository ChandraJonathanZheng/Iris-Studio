'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import RescheduleModal from '@/components/RescheduleModal'
import type { RescheduleRequest, Student } from '@/lib/types'

export default function ReschedulesPage() {
  const [requests, setRequests] = useState<(RescheduleRequest & { students: Student })[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabaseBrowser
      .from('reschedule_requests')
      .select('*, students(*)')
      .eq('status', 'pending')
      .returns<(RescheduleRequest & { students: Student })[]>()
    setRequests(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function handleApprove(id: string) {
    const { error: approveError } = await supabaseBrowser
      .from('reschedule_requests')
      .update({ status: 'approved' })
      .eq('id', id)
    if (approveError) {
      setError('Could not approve the request. Please try again.')
      return
    }
    setError(null)
    setActiveId(null)
    load()
  }

  async function handleDecline(id: string) {
    const { error: declineError } = await supabaseBrowser
      .from('reschedule_requests')
      .update({ status: 'declined' })
      .eq('id', id)
    if (declineError) {
      setError('Could not decline the request. Please try again.')
      return
    }
    setError(null)
    setActiveId(null)
    load()
  }

  const active = requests.find((r) => r.id === activeId)

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Studio</p>
      <h1 className="mt-2 text-3xl font-extrabold">Time changes</h1>
      <p className="mt-1 text-black/50">Students ask, you answer. Nothing moves until you tap yes.</p>

      <ul className="mt-5 space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded-2xl border border-amber-300 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-plum-light/20 font-bold text-plum-light">
                  {r.students.name.split(' ').map((n) => n[0]).join('')}
                </span>
                <div>
                  <p className="font-bold">{r.students.name}</p>
                  <p className="text-sm text-black/50">
                    {new Date(r.current_time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                    {new Date(r.current_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} →{' '}
                    {new Date(r.requested_time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                    {new Date(r.requested_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(r.id)}
                className="rounded-full bg-amber-200 px-4 py-2 text-xs font-bold text-amber-800"
              >
                OPEN
              </button>
            </div>
          </li>
        ))}
        {requests.length === 0 && <p className="text-black/40">No pending requests.</p>}
      </ul>

      {active && (
        <RescheduleModal
          request={active}
          studentName={active.students.name}
          error={error}
          onApprove={handleApprove}
          onDecline={handleDecline}
          onDismiss={() => {
            setActiveId(null)
            setError(null)
          }}
        />
      )}
    </div>
  )
}
