'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import type { Class, ClassStudent } from '@/lib/types'

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([])
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: classData } = await supabaseBrowser.from('classes').select('*').returns<Class[]>()
      const { data: classStudents } = await supabaseBrowser
        .from('class_students')
        .select('*')
        .returns<ClassStudent[]>()
      const counts: Record<string, number> = {}
      for (const cs of classStudents ?? []) {
        counts[cs.class_id] = (counts[cs.class_id] ?? 0) + 1
      }
      setClasses(classData ?? [])
      setStudentCounts(counts)
    }
    load()
  }, [])

  async function handleDelete(id: string) {
    const { error: deleteError } = await supabaseBrowser.from('classes').delete().eq('id', id)
    if (deleteError) {
      setError('Could not delete class. Please try again.')
      return
    }
    setError(null)
    setClasses((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Studio</p>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Classes</h1>
        <Link href="/app/studio/classes/new/edit" className="rounded-full bg-plum-light px-5 py-3 text-sm font-bold text-white">
          + Create
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <ul className="mt-5 space-y-3">
        {classes.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-lg px-2 py-1 text-xs font-bold ${
                  c.format === '1:1' ? 'bg-lime/40' : 'bg-plum-light/20 text-plum-light'
                }`}
              >
                {c.format === '1:1' ? '1:1' : 'GRP'}
              </span>
              <span className="text-sm text-black/40">{studentCounts[c.id] ?? 0} in</span>
            </div>
            <p className="mt-2 font-bold">{c.name}</p>
            <p className="text-sm text-black/50">
              {c.day} {c.time.slice(0, 5)} · {c.duration_minutes} min · Room {c.room} · {formatCurrency(c.fee_cents)}/cycle
            </p>
            <div className="mt-4 flex gap-2">
              <Link href={`/app/studio/classes/${c.id}/edit`} className="rounded-full bg-black/5 px-4 py-2 text-sm font-bold">
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="rounded-full bg-coral/10 px-4 py-2 text-sm font-bold text-coral"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
