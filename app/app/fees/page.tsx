'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { computeOutstandingCents } from '@/lib/fees'
import Pill from '@/components/Pill'
import FeesSelectionBar from '@/components/FeesSelectionBar'
import ReminderModal from '@/components/ReminderModal'
import type { Student, FeeCycle, FeePayment, Class, ClassStudent } from '@/lib/types'

interface StudentRow {
  student: Student
  payments: FeePayment[]
  feeCents: number
}

export default function FeesPage() {
  const [cycle, setCycle] = useState<FeeCycle | null>(null)
  const [rows, setRows] = useState<StudentRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: cycles, error: cyclesError } = await supabaseBrowser
          .from('fee_cycles')
          .select('*')
          .order('cycle_number', { ascending: false })
          .limit(1)
          .returns<FeeCycle[]>()

        if (cyclesError) {
          console.error('Failed to load fee cycles:', cyclesError)
          return
        }

        const currentCycle = cycles?.[0]
        if (!currentCycle) return
        setCycle(currentCycle)

        const [
          { data: students, error: studentsError },
          { data: payments, error: paymentsError },
          { data: classStudents, error: classStudentsError },
          { data: classes, error: classesError },
        ] = await Promise.all([
          supabaseBrowser.from('students').select('*').returns<Student[]>(),
          supabaseBrowser
            .from('fee_payments')
            .select('*')
            .eq('cycle_id', currentCycle.id)
            .returns<FeePayment[]>(),
          supabaseBrowser.from('class_students').select('*').returns<ClassStudent[]>(),
          supabaseBrowser.from('classes').select('*').returns<Class[]>(),
        ])

        if (studentsError) console.error('Failed to load students:', studentsError)
        if (paymentsError) console.error('Failed to load fee payments:', paymentsError)
        if (classStudentsError) console.error('Failed to load class students:', classStudentsError)
        if (classesError) console.error('Failed to load classes:', classesError)

        const classById = Object.fromEntries((classes ?? []).map((c) => [c.id, c]))
        const classIdByStudent = Object.fromEntries(
          (classStudents ?? []).map((cs) => [cs.student_id, cs.class_id])
        )

        const builtRows: StudentRow[] = (students ?? []).map((student) => ({
          student,
          payments: (payments ?? []).filter((p) => p.student_id === student.id),
          feeCents: classById[classIdByStudent[student.id]]?.fee_cents ?? 0,
        }))
        setRows(builtRows)
      } catch (err) {
        console.error('Failed to load fees page data:', err)
      }
    }
    load()
  }, [])

  function toggle(studentId: string) {
    setSelected((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    )
  }

  const totalOutstanding = rows.reduce(
    (sum, row) => sum + computeOutstandingCents(row.payments, row.feeCents),
    0
  )
  const totalCollected = rows.reduce((sum, row) => {
    const paidWeeks = row.payments.filter((p) => p.paid).length
    return sum + Math.round(paidWeeks * (row.feeCents / 4))
  }, 0)
  const selectedTotal = rows
    .filter((r) => selected.includes(r.student.id))
    .reduce((sum, row) => sum + computeOutstandingCents(row.payments, row.feeCents), 0)

  async function handleSend() {
    setModalOpen(false)
    setSelected([])
    // Reminder sending is out of scope for this pass; selection is simply cleared.
  }

  if (!cycle) return <div className="px-6 py-8">Loading…</div>

  return (
    <div className="px-6 pb-32 pt-8">
      <h1 className="text-3xl font-extrabold">Fees</h1>
      <p className="mt-1 text-black/50">
        Cycle {cycle.cycle_number} · {new Date(cycle.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} –{' '}
        {new Date(cycle.end_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} · four weeks
      </p>

      <div className="mt-5 rounded-3xl bg-plum p-6 text-white">
        <div className="flex justify-between text-xs uppercase tracking-wide text-white/60">
          <span>Collected</span>
          <span>Outstanding</span>
        </div>
        <div className="mt-2 flex justify-between text-2xl font-extrabold">
          <span>{formatCurrency(totalCollected)}</span>
          <span className="text-coral">{formatCurrency(totalOutstanding)}</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/20">
          <div
            className="h-2 rounded-full bg-lime"
            style={{
              width: `${Math.min(
                100,
                (totalCollected / Math.max(1, totalCollected + totalOutstanding)) * 100
              )}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-bold">Every student</h2>
        <button
          type="button"
          onClick={() => setSelected(rows.filter((r) => computeOutstandingCents(r.payments, r.feeCents) > 0).map((r) => r.student.id))}
          className="text-sm font-bold text-plum-light"
        >
          Select all unpaid
        </button>
      </div>

      <ul className="mt-3 space-y-3">
        {rows.map((row) => {
          const outstanding = computeOutstandingCents(row.payments, row.feeCents)
          const paidWeeks = row.payments.filter((p) => p.paid).length
          const status = outstanding === 0 ? 'PAID' : paidWeeks === 0 ? 'OVERDUE' : 'PARTIAL'
          return (
            <li
              key={row.student.id}
              className={`flex items-center gap-3 rounded-2xl bg-white p-4 ${
                selected.includes(row.student.id) ? 'ring-2 ring-plum-light' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(row.student.id)}
                onChange={() => toggle(row.student.id)}
                className="h-5 w-5"
              />
              <div className="flex-1">
                <p className="font-bold">{row.student.name}</p>
                <div className="mt-1 flex gap-1">
                  {row.payments.map((p) => (
                    <span
                      key={p.week_number}
                      className={`h-1.5 w-6 rounded-full ${p.paid ? 'bg-green-600' : 'bg-coral/40'}`}
                    />
                  ))}
                  <span className="ml-1 text-xs text-black/40">{paidWeeks}/4</span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold">{formatCurrency(outstanding)}</p>
                <Pill tone={status === 'PAID' ? 'green' : status === 'OVERDUE' ? 'coral' : 'neutral'}>
                  {status}
                </Pill>
              </div>
            </li>
          )
        })}
      </ul>

      {selected.length > 0 && (
        <FeesSelectionBar count={selected.length} totalCents={selectedTotal} onRemind={() => setModalOpen(true)} />
      )}

      {modalOpen && (
        <ReminderModal
          studentNames={rows.filter((r) => selected.includes(r.student.id)).map((r) => r.student.name)}
          totalCents={selectedTotal}
          onSend={handleSend}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
