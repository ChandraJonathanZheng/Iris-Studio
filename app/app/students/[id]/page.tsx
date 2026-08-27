import { supabaseServer } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'
import { computeOutstandingCents } from '@/lib/fees'
import Pill from '@/components/Pill'
import type { Student, Homework, FeePayment, Class, ClassStudent } from '@/lib/types'

async function getStudent(studentId: string): Promise<Student | null> {
  try {
    const db = supabaseServer()
    const { data, error } = await db
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single<Student>()

    if (error) {
      console.error('Failed to load student:', error)
      return null
    }

    return data ?? null
  } catch (err) {
    console.error('Failed to load student:', err)
    return null
  }
}

async function getHomeworkHistory(studentId: string): Promise<Homework[]> {
  try {
    const db = supabaseServer()
    const { data, error } = await db
      .from('homework')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .returns<Homework[]>()

    if (error) {
      console.error('Failed to load homework history:', error)
      return []
    }

    return data ?? []
  } catch (err) {
    console.error('Failed to load homework history:', err)
    return []
  }
}

async function getCurrentCyclePayments(studentId: string): Promise<FeePayment[]> {
  try {
    const db = supabaseServer()
    const { data: cycle, error: cycleError } = await db
      .from('fee_cycles')
      .select('id')
      .order('cycle_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cycleError) {
      console.error('Failed to load latest fee cycle:', cycleError)
      return []
    }

    if (!cycle) return []

    const { data: payments, error: paymentsError } = await db
      .from('fee_payments')
      .select('*')
      .eq('student_id', studentId)
      .eq('cycle_id', cycle.id)
      .order('week_number')
      .returns<FeePayment[]>()

    if (paymentsError) {
      console.error('Failed to load fee payments:', paymentsError)
      return []
    }

    return payments ?? []
  } catch (err) {
    console.error('Failed to load fee payments:', err)
    return []
  }
}

async function getStudentFeeCents(studentId: string): Promise<number> {
  try {
    const db = supabaseServer()
    const { data: classStudent, error: classStudentError } = await db
      .from('class_students')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle<ClassStudent>()

    if (classStudentError) {
      console.error('Failed to load class for student:', classStudentError)
      return 0
    }

    if (!classStudent) return 0

    const { data: klass, error: classError } = await db
      .from('classes')
      .select('*')
      .eq('id', classStudent.class_id)
      .maybeSingle<Class>()

    if (classError) {
      console.error('Failed to load class fee:', classError)
      return 0
    }

    return klass?.fee_cents ?? 0
  } catch (err) {
    console.error('Failed to load student fee:', err)
    return 0
  }
}

export default async function StudentDetail({ params }: { params: { id: string } }) {
  const [student, homeworkHistory, payments, feeCents] = await Promise.all([
    getStudent(params.id),
    getHomeworkHistory(params.id),
    getCurrentCyclePayments(params.id),
    getStudentFeeCents(params.id),
  ])

  if (!student) {
    return <div className="px-6 py-8">Student not found.</div>
  }

  const paidCount = payments.filter((p) => p.paid).length

  return (
    <div className="pb-6">
      <header className="rounded-b-3xl bg-plum px-6 pb-8 pt-8 text-white">
        <p className="text-white/60">‹ Students</p>
        <div className="mt-4 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-plum-light text-lg font-bold">
            {student.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold">{student.name}</h1>
            <p className="text-white/60">
              {student.voice_part} · Grade {student.grade.replace('G', '')}
            </p>
          </div>
        </div>
      </header>

      <div className="px-6">
        <section className="mt-6">
          <h2 className="text-xs uppercase tracking-wide text-black/40">Homework History</h2>
          <ul className="mt-3 space-y-3">
            {homeworkHistory.map((hw) => (
              <li key={hw.id} className="flex items-center justify-between rounded-2xl bg-white p-4">
                <div>
                  <p className="font-bold">{hw.title}</p>
                  <p className="text-sm text-black/50">
                    {hw.status === 'reviewed' ? 'reviewed' : 'sent'} · Grade {student.grade.replace('G', '')}
                  </p>
                </div>
                <Pill tone={hw.status === 'reviewed' ? 'green' : 'neutral'}>
                  {hw.status.toUpperCase()}
                </Pill>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5">
          <h2 className="text-xs uppercase tracking-wide text-black/40">Fee · 4-week cycle</h2>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {payments.map((p) => (
              <div key={p.week_number}>
                <div
                  className={`rounded-lg py-3 font-bold ${
                    p.paid ? 'bg-lime/40 text-green-800' : 'bg-coral/20 text-coral'
                  }`}
                >
                  {p.paid ? '✓' : '·'}
                </div>
                <p className="mt-1 text-xs text-black/40">W{p.week_number}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-2xl font-extrabold">
            {formatCurrency(computeOutstandingCents(payments, feeCents))} outstanding
          </p>
          <p className="text-sm text-black/40">{paidCount} of 4 weeks paid</p>
        </section>
      </div>
    </div>
  )
}
