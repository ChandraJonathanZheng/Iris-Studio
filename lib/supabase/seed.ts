import { supabaseServer } from './server'

const STUDIO_NAME = 'Iris Studio'

export async function seed() {
  const db = supabaseServer()

  const { data: existing } = await db
    .from('studios')
    .select('id')
    .eq('name', STUDIO_NAME)
    .maybeSingle()

  const studioId =
    existing?.id ??
    (
      await db
        .from('studios')
        .insert({ name: STUDIO_NAME })
        .select('id')
        .single()
    ).data!.id

  const { count } = await db
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)

  if (count && count > 0) {
    console.log('Seed data already present, skipping.')
    return
  }

  const { data: students } = await db
    .from('students')
    .insert([
      { studio_id: studioId, name: 'Chloe Wu', voice_part: 'Soprano', grade: 'G4', streak_days: 12 },
      { studio_id: studioId, name: 'Kenji Lin', voice_part: 'Tenor', grade: 'G2', streak_days: 0 },
      { studio_id: studioId, name: 'Amelia Chen', voice_part: 'Alto', grade: 'G6', streak_days: 0 },
      { studio_id: studioId, name: 'Mia Ho', voice_part: 'Soprano', grade: 'G3', streak_days: 0 },
      { studio_id: studioId, name: 'Ryan Tsai', voice_part: 'Tenor', grade: 'G1', streak_days: 2 },
      { studio_id: studioId, name: 'Sora Kim', voice_part: 'Alto', grade: 'G5', streak_days: 16 },
    ])
    .select('id, name')

  const byName = Object.fromEntries((students ?? []).map((s) => [s.name, s.id]))

  const { data: classes } = await db
    .from('classes')
    .insert([
      { studio_id: studioId, name: 'Vocal · Grade 4', format: '1:1', day: 'We', time: '10:00', duration_minutes: 45, room: 'A', fee_cents: 320000 },
      { studio_id: studioId, name: 'Vocal · Beginners', format: 'group', day: 'We', time: '11:00', duration_minutes: 30, room: 'B', fee_cents: 260000 },
      { studio_id: studioId, name: 'Harmony Group', format: 'group', day: 'We', time: '14:30', duration_minutes: 60, room: 'Studio', fee_cents: 240000 },
      { studio_id: studioId, name: 'Vocal · Advanced', format: '1:1', day: 'Fr', time: '15:00', duration_minutes: 45, room: 'A', fee_cents: 360000 },
    ])
    .select('id, name')

  const classByName = Object.fromEntries((classes ?? []).map((c) => [c.name, c.id]))

  await db.from('class_students').insert([
    { class_id: classByName['Vocal · Grade 4'], student_id: byName['Chloe Wu'] },
    { class_id: classByName['Vocal · Beginners'], student_id: byName['Kenji Lin'] },
  ])

  await db.from('homework').insert([
    {
      student_id: byName['Chloe Wu'],
      class_id: classByName['Vocal · Grade 4'],
      title: 'Sirens + lip trills, full range',
      submission_type: 'audio',
      due_date: '2026-08-25',
      minutes_per_day: 10,
      teacher_note: "Warm up first, and don't push the top — let it float.",
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      media_duration_seconds: 72,
    },
    {
      student_id: byName['Kenji Lin'],
      class_id: classByName['Vocal · Beginners'],
      title: 'Verse 1 — Fly Me to the Moon',
      submission_type: 'audio',
      due_date: '2026-08-25',
      minutes_per_day: 10,
      teacher_note: '',
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      media_duration_seconds: 48,
    },
    {
      student_id: byName['Mia Ho'],
      class_id: null,
      title: 'Posture check — standing, side view',
      submission_type: 'photo',
      due_date: '2026-08-25',
      minutes_per_day: 5,
      teacher_note: '',
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    },
  ])

  const { data: cycle } = await db
    .from('fee_cycles')
    .insert({ studio_id: studioId, cycle_number: 8, start_date: '2026-08-04', end_date: '2026-08-31' })
    .select('id')
    .single()

  const feeRows: { student_id: string; cycle_id: string; week_number: number; paid: boolean }[] = []
  const paidWeeks: Record<string, number> = {
    'Chloe Wu': 2,
    'Kenji Lin': 1,
    'Amelia Chen': 4,
    'Mia Ho': 3,
    'Ryan Tsai': 0,
    'Sora Kim': 4,
  }
  for (const [name, weeks] of Object.entries(paidWeeks)) {
    for (let w = 1; w <= 4; w++) {
      feeRows.push({ student_id: byName[name], cycle_id: cycle!.id, week_number: w, paid: w <= weeks })
    }
  }
  await db.from('fee_payments').insert(feeRows)

  await db.from('events').insert([
    { studio_id: studioId, name: 'Autumn Recital', event_date: '2026-09-06', event_time: '15:00', location: 'Studio hall, 3F', invite_scope: 'everyone', note: 'Two songs each. Families welcome. Tea afterwards.', status: 'draft' },
    { studio_id: studioId, name: 'Parent listening hour', event_date: '2026-08-23', event_time: '11:00', location: 'Room A', invite_scope: 'Piano classes', note: '', status: 'sent' },
    { studio_id: studioId, name: 'Summer open day', event_date: '2026-07-12', event_time: '14:00', location: 'Studio hall, 3F', invite_scope: 'everyone', note: '', status: 'sent' },
  ])

  await db.from('reschedule_requests').insert([
    {
      student_id: byName['Kenji Lin'],
      class_id: classByName['Vocal · Beginners'],
      current_time: '2026-08-20T11:00:00+08:00',
      requested_time: '2026-08-21T17:30:00+08:00',
      reason: 'Choir rehearsal moved to Wednesday this week.',
      status: 'pending',
    },
  ])

  console.log('Seed complete.')
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
