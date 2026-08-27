'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { validateClassForm } from '@/lib/validateClassForm'

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

export default function EditClassPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'

  const [name, setName] = useState('')
  const [format, setFormat] = useState<'1:1' | 'group'>('1:1')
  const [day, setDay] = useState<string>('We')
  const [time, setTime] = useState('10:00')
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [room, setRoom] = useState('')
  const [feeCents, setFeeCents] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    supabaseBrowser
      .from('classes')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return
        setName(data.name)
        setFormat(data.format)
        setDay(data.day)
        setTime(data.time.slice(0, 5))
        setDurationMinutes(data.duration_minutes)
        setRoom(data.room)
        setFeeCents(data.fee_cents)
      })
  }, [id, isNew])

  async function handleSave() {
    const result = validateClassForm({ name, day, time, durationMinutes, room, feeCents })
    if (!result.valid) {
      setError(result.error)
      return
    }
    setError(null)
    const payload = { name, format, day, time, duration_minutes: durationMinutes, room, fee_cents: feeCents }
    const { error: saveError } = isNew
      ? await supabaseBrowser.from('classes').insert(payload)
      : await supabaseBrowser.from('classes').update(payload).eq('id', id)
    if (saveError) {
      setError('Could not save class. Please try again.')
      return
    }
    router.push('/app/studio/classes')
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Classes</p>
      <h1 className="mt-2 text-3xl font-extrabold">{isNew ? 'New class' : 'Edit class'}</h1>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Class name</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Format</h2>
      <div className="mt-2 flex gap-2">
        {(['1:1', 'group'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={`rounded-full px-5 py-3 text-sm font-bold capitalize ${
              format === f ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {f === '1:1' ? '1-on-1' : 'Group'}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Day</h2>
      <div className="mt-2 flex gap-2">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`h-11 w-11 rounded-full text-sm font-bold ${
              day === d ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Time</h2>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-4" />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Minutes</h2>
          <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-4" />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Room</h2>
          <input value={room} onChange={(e) => setRoom(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-4" />
        </div>
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Fee per 4-week cycle (NT$)</h2>
      <input
        type="number"
        value={feeCents / 100}
        onChange={(e) => setFeeCents(Number(e.target.value) * 100)}
        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4"
      />

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <button type="button" onClick={handleSave} className="mt-6 w-full rounded-full bg-ink py-4 font-bold text-white">
        {isNew ? 'Create class' : 'Save changes'}
      </button>
    </div>
  )
}
