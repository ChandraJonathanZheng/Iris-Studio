import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import Pill from '@/components/Pill'
import type { Student, Homework } from '@/lib/types'

async function getStudents(): Promise<Student[]> {
  try {
    const db = supabaseServer()
    const { data, error } = await db.from('students').select('*').order('name').returns<Student[]>()

    if (error) {
      console.error('Failed to load students:', error)
      return []
    }

    return data ?? []
  } catch (err) {
    console.error('Failed to load students:', err)
    return []
  }
}

async function getReviewCountByStudent(): Promise<Record<string, number>> {
  try {
    const db = supabaseServer()
    const { data, error } = await db
      .from('homework')
      .select('student_id')
      .eq('status', 'submitted')
      .returns<Pick<Homework, 'student_id'>[]>()

    if (error) {
      console.error('Failed to load homework to review:', error)
      return {}
    }

    const reviewCountByStudent: Record<string, number> = {}
    for (const hw of data ?? []) {
      reviewCountByStudent[hw.student_id] = (reviewCountByStudent[hw.student_id] ?? 0) + 1
    }

    return reviewCountByStudent
  } catch (err) {
    console.error('Failed to load homework to review:', err)
    return {}
  }
}

export default async function StudentsList() {
  const [students, reviewCountByStudent] = await Promise.all([
    getStudents(),
    getReviewCountByStudent(),
  ])

  return (
    <div className="px-6 pb-6 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Students</h1>
        <span className="text-sm text-black/40">{students.length} active</span>
      </div>

      <input
        type="search"
        placeholder="Search name, instrument, grade…"
        className="mt-5 w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm"
      />

      <ul className="mt-5 space-y-3">
        {students.map((student) => {
          const reviewCount = reviewCountByStudent[student.id] ?? 0
          return (
            <li key={student.id}>
              <Link
                href={`/app/students/${student.id}`}
                className="flex items-center justify-between rounded-2xl bg-white p-5"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-plum-light/20 font-bold text-plum-light">
                    {student.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                  <div>
                    <p className="font-bold">{student.name}</p>
                    <p className="text-sm text-black/50">
                      {student.voice_part} · Grade {student.grade.replace('G', '')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Pill tone={reviewCount > 0 ? 'coral' : 'green'}>
                    {reviewCount > 0 ? 'FEE DUE' : 'PAID'}
                  </Pill>
                  <p className="mt-1 text-xs text-black/40">
                    {reviewCount > 0 ? `${reviewCount} to review` : `${student.streak_days}d streak`}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
