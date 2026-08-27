import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import WaveformBar from '@/components/WaveformBar'
import type { Homework, Student } from '@/lib/types'

type HomeworkWithStudent = Homework & { students: Pick<Student, 'id' | 'name'> }

async function getHomework(status: string): Promise<HomeworkWithStudent[]> {
  try {
    const db = supabaseServer()
    const { data, error } = await db
      .from('homework')
      .select('*, students(id, name)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .returns<HomeworkWithStudent[]>()

    if (error) {
      console.error('Failed to load homework:', error)
      return []
    }

    return data ?? []
  } catch (err) {
    console.error('Failed to load homework:', err)
    return []
  }
}

async function getCountByStatus(): Promise<Record<string, number>> {
  try {
    const db = supabaseServer()
    const counts = await Promise.all(
      (['submitted', 'assigned', 'reviewed'] as const).map(async (status) => {
        const { count, error } = await db
          .from('homework')
          .select('id', { count: 'exact', head: true })
          .eq('status', status)

        if (error) {
          console.error(`Failed to load homework count for ${status}:`, error)
          return [status, 0] as const
        }

        return [status, count ?? 0] as const
      })
    )
    return Object.fromEntries(counts)
  } catch (err) {
    console.error('Failed to load homework counts:', err)
    return { submitted: 0, assigned: 0, reviewed: 0 }
  }
}

export default async function HomeworkList({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab = searchParams.tab ?? 'submitted'

  const [homework, countByStatus] = await Promise.all([getHomework(tab), getCountByStatus()])

  const TABS = [
    { key: 'submitted', label: 'To review' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'reviewed', label: 'Reviewed' },
  ] as const

  return (
    <div className="px-6 pb-6 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Homework</h1>
        <Link href="/app/homework/give" className="rounded-full bg-plum-light px-5 py-3 text-sm font-bold text-white">
          + Give
        </Link>
      </div>

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/homework?tab=${t.key}`}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              tab === t.key ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {t.label} {countByStatus[t.key]}
          </Link>
        ))}
      </div>

      <ul className="mt-5 space-y-3">
        {homework.map((hw) => (
          <li key={hw.id} className="rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime/40">
                  {hw.submission_type === 'audio' ? '♪' : '▣'}
                </span>
                <div>
                  <p className="font-bold">{hw.students.name}</p>
                  <p className="text-sm text-black/50">{hw.title}</p>
                </div>
              </div>
              {tab === 'submitted' && (
                <Link
                  href={`/app/homework/${hw.id}/${hw.submission_type}`}
                  className="rounded-full bg-plum-light/20 px-4 py-2 text-xs font-bold text-plum-light"
                >
                  REVIEW
                </Link>
              )}
            </div>
            {hw.submission_type === 'audio' && hw.status === 'submitted' && (
              <div className="mt-3">
                <WaveformBar seed={hw.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
