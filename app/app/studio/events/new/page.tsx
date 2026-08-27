'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { validateEventForm } from '@/lib/validateEventForm'

function NewEventForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [inviteScope, setInviteScope] = useState('everyone')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editId) return
    supabaseBrowser
      .from('events')
      .select('*')
      .eq('id', editId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setName(data.name)
        setDate(data.event_date)
        setTime(data.event_time.slice(0, 5))
        setLocation(data.location)
        setInviteScope(data.invite_scope)
        setNote(data.note)
      })
  }, [editId])

  async function save(status: 'draft' | 'sent') {
    const result = validateEventForm({ name, date, time, location })
    if (!result.valid) {
      setError(result.error)
      return
    }
    setError(null)
    const payload = {
      name,
      event_date: date,
      event_time: time,
      location,
      invite_scope: inviteScope,
      note,
      status,
    }
    const { error: saveError } = editId
      ? await supabaseBrowser.from('events').update(payload).eq('id', editId)
      : await supabaseBrowser.from('events').insert(payload)
    if (saveError) {
      setError('Could not save event. Please try again.')
      return
    }
    router.push('/app/studio/events')
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Events</p>
      <h1 className="mt-2 text-3xl font-extrabold">{editId ? 'Edit event' : 'New event'}</h1>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Name</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Date</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-4" />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Time</h2>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-4" />
        </div>
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Where</h2>
      <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Invite</h2>
      <div className="mt-2 flex gap-2">
        {['everyone', 'solo students', 'group'].map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => setInviteScope(scope)}
            className={`rounded-full px-4 py-3 text-sm font-bold capitalize ${
              inviteScope === scope ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {scope}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Note</h2>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => save('draft')} className="flex-1 rounded-full bg-white py-4 font-bold">
          Save draft
        </button>
        <button type="button" onClick={() => save('sent')} className="flex-1 rounded-full bg-ink py-4 font-bold text-white">
          Save &amp; send
        </button>
      </div>
    </div>
  )
}

export default function NewEventPage() {
  return (
    <Suspense fallback={null}>
      <NewEventForm />
    </Suspense>
  )
}
