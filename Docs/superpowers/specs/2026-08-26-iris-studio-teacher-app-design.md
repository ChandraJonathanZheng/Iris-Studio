# Iris Studio Teacher App — Design Spec

Date: 2026-08-26
Status: Approved for implementation planning

## Summary

Build a responsive Next.js web application implementing the public landing
page and full teacher-facing flow from the Iris Studio Teacher-Student App
design (screens 00, 01–18). Student-facing screens (19–30) and real
authentication are explicitly out of scope for this pass.

Source mockups: `Docs/Design Docs/Iris Studio Teacher-Student App/exports/Iris Studio screens/`

## Stack

- **Framework:** Next.js (App Router, TypeScript)
- **Database:** Supabase Postgres
- **File storage:** Supabase Storage
- **Hosting:** Netlify
- **Styling:** Tailwind CSS

## Scope

In scope:
- Public landing page (screen 00)
- Teacher home dashboard (01)
- Students list + detail (02, 03)
- Homework list, audio review, photo review, give-homework form (04–07)
- Fees list, multi-select, WhatsApp reminder modal (08–10)
- Studio hub: events (upcoming/history/create), classes (list/create/edit),
  reschedule requests (list + approve/decline modal) (11–18)

Out of scope (future passes):
- Student-facing app (screens 19–30)
- Real authentication / login (screens 00b, 00c) — single seeded studio
  tenant stands in for now
- Actual WhatsApp/LINE message sending — reminder/send actions write a
  record but do not call an external messaging API yet

## Layout & Styling

- Centered single-column layout, max-width ~480px, matching the mobile/LIFF
  mockups exactly, on all viewport sizes (no desktop multi-column
  redesign in this pass).
- Persistent bottom tab bar (Home / Students / Homework / Fees / Studio)
  as a shared layout across all `/app/*` routes.
- Visual language from mockups: cream background (`#EFEAE0`-ish), deep
  purple header/hero cards (`#2E1B6B`-ish), coral/orange alert cards, lime
  accent highlights, black pill primary buttons, soft rounded white cards.
- Tailwind CSS with a small custom theme extension for these colors.

## Routes

| Route | Screen(s) | Notes |
|---|---|---|
| `/` | 00 | Public landing |
| `/app` | 01 | Teacher home |
| `/app/students` | 02 | Filterable/searchable list |
| `/app/students/[id]` | 03 | Student detail: class, homework history, fee cycle |
| `/app/homework` | 04 | Tabs: To review / Assigned / Reviewed |
| `/app/homework/[id]/audio` | 05 | Audio review + rating + quick notes + feedback |
| `/app/homework/[id]/photo` | 06 | Photo review + rating + quick notes + feedback |
| `/app/homework/give` | 07 | Multi-student assign form |
| `/app/fees` | 08, 09 | Cycle summary, per-student rows, multi-select |
| `/app/fees` (modal) | 10 | WhatsApp reminder tone + send |
| `/app/studio` | 11 | Hub: Events / Classes / Time changes / Settings |
| `/app/studio/events` | 12, 13 | Upcoming / History tabs |
| `/app/studio/events/new` | 14 | Create/edit event form |
| `/app/studio/classes` | 15 | Class list |
| `/app/studio/classes/[id]/edit` | 16 | Edit class form (also used for create) |
| `/app/studio/reschedules` | 17 | Pending requests list |
| `/app/studio/reschedules` (modal) | 18 | Approve/decline modal |

## Data Model (Supabase Postgres)

```sql
studios (
  id uuid pk,
  name text,
  created_at timestamptz
)

students (
  id uuid pk,
  studio_id uuid fk -> studios,
  name text,
  voice_part text,       -- Soprano/Alto/Tenor/Bass
  grade text,             -- e.g. "G4"
  streak_days int default 0,
  created_at timestamptz
)

classes (
  id uuid pk,
  studio_id uuid fk -> studios,
  name text,               -- "Vocal · Grade 4"
  format text,              -- '1:1' | 'group'
  day text,                 -- 'Mo'..'Su'
  time time,
  duration_minutes int,
  room text,
  fee_cents int,
  created_at timestamptz
)

class_students (
  class_id uuid fk -> classes,
  student_id uuid fk -> students,
  primary key (class_id, student_id)
)

homework (
  id uuid pk,
  student_id uuid fk -> students,
  class_id uuid fk -> classes,
  title text,
  submission_type text,     -- 'audio' | 'photo'
  due_date date,
  minutes_per_day int,
  teacher_note text,
  status text,               -- 'assigned' | 'submitted' | 'reviewed'
  sent_at timestamptz,
  submitted_at timestamptz,
  media_url text,             -- Supabase Storage URL
  media_duration_seconds int, -- for audio
  rating int,                  -- 1-5
  quick_notes text[],
  feedback_text text,
  created_at timestamptz
)

fee_cycles (
  id uuid pk,
  studio_id uuid fk -> studios,
  cycle_number int,
  start_date date,
  end_date date
)

fee_payments (
  id uuid pk,
  student_id uuid fk -> students,
  cycle_id uuid fk -> fee_cycles,
  week_number int,           -- 1-4
  paid boolean default false,
  paid_at timestamptz
)

events (
  id uuid pk,
  studio_id uuid fk -> studios,
  name text,
  event_date date,
  event_time time,
  location text,
  invite_scope text,        -- 'everyone' | 'solo' | class name/group
  note text,
  status text,                -- 'draft' | 'sent'
  created_at timestamptz
)

reschedule_requests (
  id uuid pk,
  student_id uuid fk -> students,
  class_id uuid fk -> classes,
  current_time timestamptz,
  requested_time timestamptz,
  reason text,
  status text,               -- 'pending' | 'approved' | 'declined'
  created_at timestamptz
)
```

Storage buckets: `homework-audio`, `homework-photos` (public read, teacher
writes via server route/service role).

RLS: disabled or fully permissive for this pass (no auth yet). Note in code
that policies will be tightened once auth lands.

## Key Interactions

- **Fees multi-select + reminder:** selecting rows shows a floating action
  bar ("N selected · NT$ total") with a Remind button, matching screen 09.
  Tapping opens the WhatsApp-tone modal (screen 10); choosing a tone +
  "Send N reminders" writes a reminder log (no real WhatsApp send yet) and
  closes the sheet.
- **Homework review:** star rating (1-5) + quick-note chip toggles (one or
  multiple) + free-text feedback, "Send feedback" updates `homework.status`
  to `reviewed`.
- **Give homework:** multi-select student chips, task/piece text, due date,
  minutes/day, submission type toggle (Audio/Photo), note, submit creates
  one `homework` row per selected student.
- **Reschedule approval:** modal shows current vs requested time and
  reason; Approve updates the request to `approved` and updates the
  student's class time reference for that occurrence; Decline sets
  `declined`.
- **Events:** Save draft → `status = 'draft'`; Save & send → `status =
  'sent'` (message sending itself is out of scope, per above).

## Testing

- Component/unit tests for form validation logic (give-homework,
  event form, class form).
- Integration-style tests against a local Supabase (or mocked client) for
  the fee-payment toggle, homework status transitions, and reschedule
  approval flow.
- Manual verification in browser against each of the 19 routes for visual
  parity with the mockups.

## Environment / Secrets

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-side,
  safe to expose.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used in seed scripts and any
  server actions that need elevated access (e.g. Storage uploads before
  RLS is configured). Never committed; lives in Netlify env vars and local
  `.env.local` (gitignored).
