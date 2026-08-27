import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'
import { computeUnpaidCents } from '@/lib/fees'
import StatCard from '@/components/StatCard'
import type { Homework, RescheduleRequest, Event, Class, FeeCycle, FeePayment, ClassStudent } from '@/lib/types'

async function getDashboardCounts(): Promise<{
  toReview: Homework[]
  pendingReschedules: RescheduleRequest[]
  events: Event[]
  classes: Class[]
}> {
  try {
    const db = supabaseServer()
    const [
      { data: toReview, error: toReviewError },
      { data: pendingReschedules, error: pendingReschedulesError },
      { data: events, error: eventsError },
      { data: classes, error: classesError },
    ] = await Promise.all([
      db.from('homework').select('*').eq('status', 'submitted').returns<Homework[]>(),
      db
        .from('reschedule_requests')
        .select('*')
        .eq('status', 'pending')
        .returns<RescheduleRequest[]>(),
      db
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString().slice(0, 10))
        .returns<Event[]>(),
      db.from('classes').select('*').returns<Class[]>(),
    ])

    if (toReviewError) console.error('Failed to load homework to review:', toReviewError)
    if (pendingReschedulesError)
      console.error('Failed to load pending reschedules:', pendingReschedulesError)
    if (eventsError) console.error('Failed to load upcoming events:', eventsError)
    if (classesError) console.error('Failed to load classes:', classesError)

    return {
      toReview: toReview ?? [],
      pendingReschedules: pendingReschedules ?? [],
      events: events ?? [],
      classes: classes ?? [],
    }
  } catch (err) {
    console.error('Failed to load dashboard counts:', err)
    return { toReview: [], pendingReschedules: [], events: [], classes: [] }
  }
}

async function getUnpaidCents(): Promise<number> {
  try {
    const db = supabaseServer()
    const { data: latestCycle, error: latestCycleError } = await db
      .from('fee_cycles')
      .select('*')
      .order('cycle_number', { ascending: false })
      .limit(1)
      .maybeSingle<FeeCycle>()

    if (latestCycleError) {
      console.error('Failed to load latest fee cycle:', latestCycleError)
      return 0
    }

    if (!latestCycle) return 0

    const [
      { data: payments, error: paymentsError },
      { data: classStudents, error: classStudentsError },
      { data: allClasses, error: classesError },
    ] = await Promise.all([
      db.from('fee_payments').select('*').eq('cycle_id', latestCycle.id).returns<FeePayment[]>(),
      db.from('class_students').select('*').returns<ClassStudent[]>(),
      db.from('classes').select('*').returns<Class[]>(),
    ])

    if (paymentsError) console.error('Failed to load fee payments:', paymentsError)
    if (classStudentsError) console.error('Failed to load class students:', classStudentsError)
    if (classesError) console.error('Failed to load classes:', classesError)

    const classById = Object.fromEntries((allClasses ?? []).map((c) => [c.id, c]))
    const classIdByStudent = Object.fromEntries(
      (classStudents ?? []).map((cs) => [cs.student_id, cs.class_id])
    )
    const paymentsByStudent: Record<string, FeePayment[]> = {}
    for (const p of payments ?? []) {
      paymentsByStudent[p.student_id] = [...(paymentsByStudent[p.student_id] ?? []), p]
    }
    const feeCentsByStudent = Object.fromEntries(
      Object.keys(paymentsByStudent).map((studentId) => [
        studentId,
        classById[classIdByStudent[studentId]]?.fee_cents ?? 0,
      ])
    )
    return computeUnpaidCents(paymentsByStudent, feeCentsByStudent)
  } catch (err) {
    console.error('Failed to load unpaid fee total:', err)
    return 0
  }
}

export default async function TeacherHome() {
  const [{ toReview, pendingReschedules, events, classes }, unpaidCents] = await Promise.all([
    getDashboardCounts(),
    getUnpaidCents(),
  ])

  const reviewCount = toReview.length
  const rescheduleCount = pendingReschedules.length
  const eventCount = events.length
  const classCount = classes.length

  return (
    <div className="px-6 pb-6 pt-8">
      <header className="rounded-b-3xl bg-plum px-6 py-8 -mx-6 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Iris Studio</h1>
          <div className="h-9 w-9 rounded-full bg-plum-light" />
        </div>
        <p className="mt-6 text-white/60">Morning, Iris —</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-snug">
          {reviewCount + rescheduleCount} things want you
          {rescheduleCount > 0 ? ` — ${rescheduleCount} are urgent.` : '.'}
        </h2>
      </header>

      <div className="mt-6 rounded-2xl bg-coral p-5 text-white">
        <p className="text-xs uppercase tracking-wide text-white/80">Unpaid this cycle</p>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-3xl font-extrabold">{formatCurrency(unpaidCents)}</p>
          <Link href="/app/fees" className="rounded-full bg-white px-5 py-2 text-sm font-bold text-coral">
            Remind
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Link href="/app/homework">
          <StatCard value={reviewCount} label="Homework to review" />
        </Link>
        <Link href="/app/studio/reschedules">
          <StatCard value={rescheduleCount} label="Reschedule requests" tone="plum" />
        </Link>
        <Link href="/app/studio/events">
          <StatCard value={eventCount} label="Upcoming events" />
        </Link>
        <Link href="/app/studio/classes">
          <StatCard value={classCount} label="Classes running" />
        </Link>
      </div>
    </div>
  )
}
