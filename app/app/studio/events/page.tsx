'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { Event } from '@/lib/types'

export default function EventsPage() {
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const query = supabaseBrowser.from('events').select('*').order('event_date')
      const { data } =
        tab === 'upcoming' ? await query.gte('event_date', today) : await query.lt('event_date', today)
      setEvents((data as Event[]) ?? [])
    }
    load()
  }, [tab])

  async function handleDelete(id: string) {
    const { error: deleteError } = await supabaseBrowser.from('events').delete().eq('id', id)
    if (deleteError) {
      setError('Could not delete event. Please try again.')
      return
    }
    setError(null)
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  async function handleSend(id: string) {
    const { error: sendError } = await supabaseBrowser.from('events').update({ status: 'sent' }).eq('id', id)
    if (sendError) {
      setError('Could not send event. Please try again.')
      return
    }
    setError(null)
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'sent' } : e)))
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Studio</p>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Events</h1>
        <Link href="/app/studio/events/new" className="rounded-full bg-plum-light px-5 py-3 text-sm font-bold text-white">
          + Create
        </Link>
      </div>

      <div className="mt-5 flex gap-2">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${
              tab === t ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <ul className="mt-5 space-y-3">
        {events.map((event) => {
          const isNext = tab === 'upcoming' && events[0]?.id === event.id
          return (
            <li
              key={event.id}
              className={`rounded-2xl p-5 ${isNext ? 'bg-ink text-white' : 'bg-white'}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl font-bold ${
                    isNext ? 'bg-lime text-ink' : 'bg-plum-light/20 text-plum-light'
                  }`}
                >
                  <span>{new Date(event.event_date).getDate()}</span>
                  <span className="text-[10px] uppercase">
                    {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                </div>
                <div>
                  <p className="font-bold">{event.name}</p>
                  <p className={`text-sm ${isNext ? 'text-white/60' : 'text-black/50'}`}>
                    {event.event_time.slice(0, 5)} · {event.location} · {event.invite_scope}
                  </p>
                  <p className={`mt-1 text-sm font-medium ${isNext ? 'text-lime' : 'text-green-700'}`}>
                    {event.status === 'sent' ? 'Sent' : 'Not announced yet'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {event.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => handleSend(event.id)}
                    className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink"
                  >
                    Send to all
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend(event.id)}
                    className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold"
                  >
                    Resend
                  </button>
                )}
                <Link
                  href={`/app/studio/events/new?id=${event.id}`}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${isNext ? 'bg-white/10' : 'bg-black/5'}`}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(event.id)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${isNext ? 'bg-white/10' : 'bg-black/5'}`}
                >
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
