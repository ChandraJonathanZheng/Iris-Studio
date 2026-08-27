'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { validateGiveHomeworkForm } from '@/lib/giveHomeworkValidation'
import type { Student } from '@/lib/types'

export default function GiveHomeworkPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [minutesPerDay, setMinutesPerDay] = useState(10)
  const [submissionType, setSubmissionType] = useState<'audio' | 'photo'>('audio')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabaseBrowser
      .from('students')
      .select('*')
      .order('name')
      .then(({ data }) => setStudents((data as Student[]) ?? []))
  }, [])

  function toggleStudent(id: string) {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit() {
    const result = validateGiveHomeworkForm({ studentIds, title, dueDate, minutesPerDay })
    if (!result.valid) {
      setError(result.error)
      return
    }
    setError(null)
    await supabaseBrowser.from('homework').insert(
      studentIds.map((student_id) => ({
        student_id,
        title,
        due_date: dueDate,
        minutes_per_day: minutesPerDay,
        submission_type: submissionType,
        teacher_note: note,
        status: 'assigned',
      }))
    )
    router.push('/app/homework')
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Back</p>
      <h1 className="mt-2 text-3xl font-extrabold">Give homework</h1>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Who</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggleStudent(s.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              studentIds.includes(s.id) ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {s.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Piece / Task</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4"
      />

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Due</h2>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-4"
          />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Minutes/day</h2>
          <input
            type="number"
            value={minutesPerDay}
            onChange={(e) => setMinutesPerDay(Number(e.target.value))}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-4"
          />
        </div>
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">They send back</h2>
      <div className="mt-2 flex gap-2">
        {(['audio', 'photo'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSubmissionType(type)}
            className={`rounded-full px-5 py-3 text-sm font-bold capitalize ${
              submissionType === type ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Note</h2>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4"
      />

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        className="mt-6 w-full rounded-full bg-ink py-4 font-bold text-white"
      >
        Give to {studentIds.length} student{studentIds.length === 1 ? '' : 's'}
      </button>
    </div>
  )
}
