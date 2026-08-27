import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'

async function getStudioCounts(): Promise<{
  upcomingEvents: number
  classCount: number
  pendingReschedules: number
}> {
  try {
    const db = supabaseServer()
    const [
      { count: upcomingEvents, error: upcomingEventsError },
      { count: classCount, error: classCountError },
      { count: pendingReschedules, error: pendingReschedulesError },
    ] = await Promise.all([
      db
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('event_date', new Date().toISOString().slice(0, 10)),
      db.from('classes').select('id', { count: 'exact', head: true }),
      db.from('reschedule_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

    if (upcomingEventsError) console.error('Failed to load upcoming event count:', upcomingEventsError)
    if (classCountError) console.error('Failed to load class count:', classCountError)
    if (pendingReschedulesError)
      console.error('Failed to load pending reschedule count:', pendingReschedulesError)

    return {
      upcomingEvents: upcomingEvents ?? 0,
      classCount: classCount ?? 0,
      pendingReschedules: pendingReschedules ?? 0,
    }
  } catch (err) {
    console.error('Failed to load studio counts:', err)
    return { upcomingEvents: 0, classCount: 0, pendingReschedules: 0 }
  }
}

export default async function StudioHub() {
  const { upcomingEvents, classCount, pendingReschedules } = await getStudioCounts()

  const items = [
    {
      href: '/app/studio/events',
      title: 'Events',
      meta: `${upcomingEvents} upcoming`,
      icon: '◆',
      bg: 'bg-plum-light/20',
    },
    {
      href: '/app/studio/classes',
      title: 'Classes',
      meta: `${classCount} running`,
      icon: '☰',
      bg: 'bg-lime/40',
    },
    {
      href: '/app/studio/reschedules',
      title: 'Time changes',
      meta: `${pendingReschedules} waiting on you`,
      icon: '⇄',
      bg: 'bg-amber-200',
    },
  ]

  return (
    <div className="px-6 pb-6 pt-8">
      <h1 className="text-3xl font-extrabold">Studio</h1>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex items-center justify-between rounded-2xl bg-white p-5">
              <div className="flex items-center gap-4">
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg ${item.bg}`}>
                  {item.icon}
                </span>
                <div>
                  <p className="font-bold">{item.title}</p>
                  <p className="text-sm text-black/50">{item.meta}</p>
                </div>
              </div>
              <span className="text-black/30">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
