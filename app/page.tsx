import { supabaseServer } from '@/lib/supabase/server'
import type { Event } from '@/lib/types'

async function getUpcomingEvents(): Promise<Event[]> {
  try {
    const db = supabaseServer()
    const { data, error } = await db
      .from('events')
      .select('*')
      .gte('event_date', new Date().toISOString().slice(0, 10))
      .order('event_date', { ascending: true })
      .returns<Event[]>()

    if (error) {
      console.error('Failed to load upcoming events:', error)
      return []
    }

    return data ?? []
  } catch (err) {
    console.error('Failed to load upcoming events:', err)
    return []
  }
}

export default async function Home() {
  const upcoming = await getUpcomingEvents()

  return (
    <div className="app-column px-6 pb-12 pt-8">
      <div className="flex items-start justify-between">
        <h1 className="text-4xl font-extrabold leading-tight">
          Iris
          <br />
          Studio
        </h1>
        <button
          aria-label="Menu"
          className="rounded-full border border-black/10 bg-white p-3"
        >
          ☰
        </button>
      </div>
      <div className="mt-3 h-1 w-16 rounded-full bg-coral" />
      <p className="mt-6 text-black/60">
        Voice lessons in Taipei. Grades, harmony, recitals — taught one singer at a time.
      </p>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Upcoming Events</h2>
        <span className="text-xs uppercase tracking-wide text-black/40">
          {upcoming.length} coming up
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {upcoming.map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm"
          >
            <div>
              <p className="font-bold">{event.name}</p>
              <p className="text-sm text-black/50">
                {event.location} · {event.event_time.slice(0, 5)}
              </p>
            </div>
            <span className="text-sm font-medium">
              {new Date(event.event_date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-3xl bg-plum p-6 text-white">
        <p className="font-bold">Already with the studio?</p>
      </div>
    </div>
  )
}
