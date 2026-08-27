'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import StarRating from '@/components/StarRating'
import QuickNoteChips from '@/components/QuickNoteChips'
import type { Homework, Student } from '@/lib/types'

const QUICK_NOTES = ['Lovely tone', 'Watch the pitch', 'Breathe lower', 'Open the vowel', 'Nearly there']

export default function PhotoReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [homework, setHomework] = useState<(Homework & { students: Student }) | null>(null)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState<string[]>([])
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    supabaseBrowser
      .from('homework')
      .select('*, students(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => setHomework(data as Homework & { students: Student }))
  }, [id])

  function toggleNote(note: string) {
    setNotes((prev) => (prev.includes(note) ? prev.filter((n) => n !== note) : [...prev, note]))
  }

  async function handleSend() {
    await supabaseBrowser
      .from('homework')
      .update({ status: 'reviewed', rating, quick_notes: notes, feedback_text: feedback })
      .eq('id', id)
    router.push('/app/homework')
  }

  if (!homework) return <div className="px-6 py-8">Loading…</div>

  return (
    <div className="pb-6">
      <header className="bg-ink px-6 pb-8 pt-8 text-white">
        <p className="text-white/40">‹ Homework</p>
        <h1 className="mt-2 text-3xl font-extrabold">{homework.students.name}</h1>
        <p className="mt-1 text-white/50">{homework.title}</p>
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/30 bg-white/5 p-10 text-center">
          {homework.media_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={homework.media_url} alt={homework.title} className="max-h-64 rounded-xl" />
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lime/40">▣</span>
              <p className="mt-3 text-xs uppercase tracking-wide text-white/50">
                Photo from {homework.students.name.split(' ')[0]}
              </p>
            </>
          )}
        </div>
      </header>

      <div className="px-6">
        <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">How was it?</h2>
        <div className="mt-3">
          <StarRating value={rating} onChange={setRating} />
        </div>

        <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Quick notes</h2>
        <div className="mt-3">
          <QuickNoteChips options={QUICK_NOTES} selected={notes} onToggle={toggleNote} />
        </div>

        <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Feedback</h2>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          placeholder="Type what you'd say in the room…"
          className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4"
        />

        <button
          type="button"
          onClick={handleSend}
          className="mt-6 w-full rounded-full bg-plum-light py-4 font-bold text-white"
        >
          Send feedback
        </button>
      </div>
    </div>
  )
}
