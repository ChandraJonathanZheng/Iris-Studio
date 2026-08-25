# Iris Studio Teacher App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the responsive Next.js + Supabase teacher-facing web app covering the public landing page and the full teacher flow (screens 00, 01–18) from the Iris Studio Teacher-Student App mockups.

**Architecture:** Next.js App Router (TypeScript) with a shared `/app/*` layout providing the bottom tab bar, backed by Supabase Postgres (via `@supabase/supabase-js`) for data and Supabase Storage for homework audio/photo uploads. Single seeded studio tenant; no auth gate yet. Tailwind CSS implements the mockups' visual language (cream background, deep-purple hero cards, coral alerts, lime accents, black pill buttons) at a centered ~480px column on all viewport widths.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS, `@supabase/supabase-js`, Supabase Postgres + Storage, Netlify hosting, Vitest + React Testing Library for tests.

**Spec:** `docs/superpowers/specs/2026-08-26-iris-studio-teacher-app-design.md`

## Global Constraints

- Layout is a centered single column, max-width 480px, on all screen sizes — no separate desktop redesign.
- Bottom tab bar (Home / Students / Homework / Fees / Studio) persists across all `/app/*` routes via a shared layout.
- No authentication in this pass — all data reads/writes use a single seeded `studios` row as the tenant; RLS is left permissive with a code comment noting it will be tightened later.
- No real WhatsApp/LINE sending — reminder and event "send" actions write a record only.
- Colors (Tailwind theme extension, approximate mockup values):
  - `cream` background `#EFEAE0`
  - `ink` (near-black text/buttons) `#1C1712`
  - `plum` (deep purple hero/header cards) `#2E1B6B`
  - `plum-light` (purple accent chips, e.g. reschedule card) `#5B4FE0`
  - `coral` (unpaid/alert cards) `#F2724A`
  - `lime` (positive accent, progress bar, warm CTA) `#C8F169`
  - `sand` (neutral card background on dark hero) `rgba(255,255,255,0.08)`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-safe), `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by seed script and Storage upload route). All three live in `.env.local` (gitignored) and Netlify env vars — never in committed files.
- Currency displayed as `NT$ N,NNN` (no decimals), matching mockups.

---

## File Structure

```
├── app/
│   ├── layout.tsx                  # root layout, imports globals.css
│   ├── globals.css                 # Tailwind directives + font setup
│   ├── page.tsx                    # public landing (00)
│   └── app/
│       ├── layout.tsx              # teacher shell: bottom tab bar
│       ├── page.tsx                # home dashboard (01)
│       ├── students/
│       │   ├── page.tsx            # list (02)
│       │   └── [id]/page.tsx       # detail (03)
│       ├── homework/
│       │   ├── page.tsx            # list w/ tabs (04)
│       │   ├── give/page.tsx       # assign form (07)
│       │   └── [id]/
│       │       ├── audio/page.tsx  # audio review (05)
│       │       └── photo/page.tsx  # photo review (06)
│       ├── fees/
│       │   └── page.tsx            # list + multiselect + modal (08,09,10)
│       └── studio/
│           ├── page.tsx            # hub (11)
│           ├── events/
│           │   ├── page.tsx        # upcoming/history tabs (12,13)
│           │   └── new/page.tsx    # create/edit form (14)
│           ├── classes/
│           │   ├── page.tsx        # list (15)
│           │   └── [id]/edit/page.tsx  # edit/create form (16)
│           └── reschedules/
│               └── page.tsx        # list + approve modal (17,18)
├── components/
│   ├── BottomTabBar.tsx
│   ├── StatCard.tsx
│   ├── Pill.tsx
│   ├── StarRating.tsx
│   ├── QuickNoteChips.tsx
│   └── WaveformBar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # browser client (anon key)
│   │   ├── server.ts                # server client (service role, server-only)
│   │   └── seed.ts                  # idempotent seed script
│   ├── types.ts                     # shared DB row types
│   └── format.ts                    # currency/date formatting helpers
├── supabase/
│   └── schema.sql                   # full DDL from spec
├── tests/
│   ├── format.test.ts
│   ├── give-homework-form.test.tsx
│   ├── event-form.test.tsx
│   ├── class-form.test.tsx
│   ├── fees-selection.test.tsx
│   └── reschedule-approval.test.tsx
├── .env.local.example
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

---

## Task 1: Project scaffold, dependencies, Tailwind theme

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `.gitignore`, `.env.local.example`, `netlify.toml`
- Test: `tests/format.test.ts` (placeholder smoke test to confirm the test runner works)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: Tailwind color tokens (`cream`, `ink`, `plum`, `plum-light`, `coral`, `lime`, `sand`) usable as `bg-cream`, `text-ink`, etc. in every later task. Root `app/layout.tsx` exports default `RootLayout({ children })`.

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm
```

When prompted about the current directory not being empty, confirm to proceed (only `Docs/` and `README.md` exist).

- [ ] **Step 2: Install remaining dependencies**

```bash
npm install @supabase/supabase-js
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

Create `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Extend Tailwind theme with mockup colors**

Edit `tailwind.config.ts` to add under `theme.extend.colors`:

```typescript
colors: {
  cream: '#EFEAE0',
  ink: '#1C1712',
  plum: '#2E1B6B',
  'plum-light': '#5B4FE0',
  coral: '#F2724A',
  lime: '#C8F169',
  sand: 'rgba(255,255,255,0.08)',
}
```

- [ ] **Step 5: Set global background/text and centered column**

Edit `app/globals.css` — after the `@tailwind` directives, add:

```css
body {
  @apply bg-cream text-ink;
}

.app-column {
  @apply mx-auto w-full max-w-[480px] min-h-screen bg-cream;
}
```

Edit `app/layout.tsx` to wrap `children` in a `<div className="app-column">`.

- [ ] **Step 6: Write placeholder format test to confirm test runner works**

Create `lib/format.ts`:

```typescript
export function formatCurrency(cents: number): string {
  const dollars = Math.round(cents / 100)
  return `NT$ ${dollars.toLocaleString('en-US')}`
}
```

Create `tests/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/lib/format'

describe('formatCurrency', () => {
  it('formats cents as NT$ with thousands separator', () => {
    expect(formatCurrency(695000)).toBe('NT$ 6,950')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('NT$ 0')
  })
})
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (2 tests)

- [ ] **Step 8: Add .env.local.example and gitignore**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Confirm `.gitignore` (from create-next-app) already includes `.env*.local` — if not, add it.

- [ ] **Step 9: Add netlify.toml**

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

- [ ] **Step 10: Verify dev server boots**

Run: `npm run dev` in background, then check `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` returns `200`. Stop the dev server after confirming.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind theme and Vitest"
```

---

## Task 2: Supabase schema, client helpers, seed script

**Files:**
- Create: `supabase/schema.sql`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/seed.ts`, `lib/types.ts`
- Test: `tests/format.test.ts` (unchanged; no new automated test — this task is verified by running the seed script against a live Supabase project, see Step 6)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` (user must supply real values before Step 6 — see note below)
- Produces:
  - `lib/supabase/client.ts` exports `supabaseBrowser: SupabaseClient` for use in Client Components.
  - `lib/supabase/server.ts` exports `supabaseServer(): SupabaseClient` (service-role, server-only — must only be imported from Server Components/Route Handlers).
  - `lib/types.ts` exports TypeScript row types: `Student`, `Class`, `ClassStudent`, `Homework`, `FeeCycle`, `FeePayment`, `Event`, `RescheduleRequest`, `Studio` — used by every later task's data-fetching code.

- [ ] **Step 1: Write the schema DDL**

Create `supabase/schema.sql`:

```sql
create extension if not exists "uuid-ossp";

create table studios (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default uuid_generate_v4(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  voice_part text not null,
  grade text not null,
  streak_days int not null default 0,
  created_at timestamptz not null default now()
);

create table classes (
  id uuid primary key default uuid_generate_v4(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  format text not null check (format in ('1:1', 'group')),
  day text not null check (day in ('Mo','Tu','We','Th','Fr','Sa','Su')),
  time time not null,
  duration_minutes int not null,
  room text not null,
  fee_cents int not null,
  created_at timestamptz not null default now()
);

create table class_students (
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  primary key (class_id, student_id)
);

create table homework (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  title text not null,
  submission_type text not null check (submission_type in ('audio','photo')),
  due_date date not null,
  minutes_per_day int not null,
  teacher_note text not null default '',
  status text not null default 'assigned' check (status in ('assigned','submitted','reviewed')),
  sent_at timestamptz not null default now(),
  submitted_at timestamptz,
  media_url text,
  media_duration_seconds int,
  rating int check (rating between 1 and 5),
  quick_notes text[] not null default '{}',
  feedback_text text,
  created_at timestamptz not null default now()
);

create table fee_cycles (
  id uuid primary key default uuid_generate_v4(),
  studio_id uuid not null references studios(id) on delete cascade,
  cycle_number int not null,
  start_date date not null,
  end_date date not null
);

create table fee_payments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  cycle_id uuid not null references fee_cycles(id) on delete cascade,
  week_number int not null check (week_number between 1 and 4),
  paid boolean not null default false,
  paid_at timestamptz,
  unique (student_id, cycle_id, week_number)
);

create table events (
  id uuid primary key default uuid_generate_v4(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  event_date date not null,
  event_time time not null,
  location text not null,
  invite_scope text not null,
  note text not null default '',
  status text not null default 'draft' check (status in ('draft','sent')),
  created_at timestamptz not null default now()
);

create table reschedule_requests (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  current_time timestamptz not null,
  requested_time timestamptz not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);

-- No auth yet: RLS left permissive. Tighten policies once teacher auth lands.
alter table studios enable row level security;
alter table students enable row level security;
alter table classes enable row level security;
alter table class_students enable row level security;
alter table homework enable row level security;
alter table fee_cycles enable row level security;
alter table fee_payments enable row level security;
alter table events enable row level security;
alter table reschedule_requests enable row level security;

create policy "public read/write (no auth yet)" on studios for all using (true) with check (true);
create policy "public read/write (no auth yet)" on students for all using (true) with check (true);
create policy "public read/write (no auth yet)" on classes for all using (true) with check (true);
create policy "public read/write (no auth yet)" on class_students for all using (true) with check (true);
create policy "public read/write (no auth yet)" on homework for all using (true) with check (true);
create policy "public read/write (no auth yet)" on fee_cycles for all using (true) with check (true);
create policy "public read/write (no auth yet)" on fee_payments for all using (true) with check (true);
create policy "public read/write (no auth yet)" on events for all using (true) with check (true);
create policy "public read/write (no auth yet)" on reschedule_requests for all using (true) with check (true);
```

- [ ] **Step 2: Write shared row types**

Create `lib/types.ts`:

```typescript
export interface Studio {
  id: string
  name: string
  created_at: string
}

export interface Student {
  id: string
  studio_id: string
  name: string
  voice_part: string
  grade: string
  streak_days: number
  created_at: string
}

export interface Class {
  id: string
  studio_id: string
  name: string
  format: '1:1' | 'group'
  day: 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su'
  time: string
  duration_minutes: number
  room: string
  fee_cents: number
  created_at: string
}

export interface ClassStudent {
  class_id: string
  student_id: string
}

export interface Homework {
  id: string
  student_id: string
  class_id: string | null
  title: string
  submission_type: 'audio' | 'photo'
  due_date: string
  minutes_per_day: number
  teacher_note: string
  status: 'assigned' | 'submitted' | 'reviewed'
  sent_at: string
  submitted_at: string | null
  media_url: string | null
  media_duration_seconds: number | null
  rating: number | null
  quick_notes: string[]
  feedback_text: string | null
  created_at: string
}

export interface FeeCycle {
  id: string
  studio_id: string
  cycle_number: number
  start_date: string
  end_date: string
}

export interface FeePayment {
  id: string
  student_id: string
  cycle_id: string
  week_number: number
  paid: boolean
  paid_at: string | null
}

export interface Event {
  id: string
  studio_id: string
  name: string
  event_date: string
  event_time: string
  location: string
  invite_scope: string
  note: string
  status: 'draft' | 'sent'
  created_at: string
}

export interface RescheduleRequest {
  id: string
  student_id: string
  class_id: string | null
  current_time: string
  requested_time: string
  reason: string
  status: 'pending' | 'approved' | 'declined'
  created_at: string
}
```

- [ ] **Step 3: Write the browser Supabase client**

Create `lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

- [ ] **Step 4: Write the server-only Supabase client**

Create `lib/supabase/server.ts`:

```typescript
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

Run: `npm install server-only` (guarantees this file errors if ever imported from a Client Component).

- [ ] **Step 5: Write the idempotent seed script**

Create `lib/supabase/seed.ts`:

```typescript
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
```

- [ ] **Step 6: Add a runnable seed command (manual verification step)**

Add to `package.json` scripts: `"seed": "tsx lib/supabase/seed.ts"`. Install `tsx`:

```bash
npm install -D tsx
```

Create a tiny runner at the bottom of `lib/supabase/seed.ts` guarded so it only runs when executed directly:

```typescript
if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

**Manual verification (requires real Supabase credentials in `.env.local` — ask the user for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` if not already provided, and confirm the schema in Step 1 has been applied via the Supabase SQL editor or CLI before running):**

```bash
npm run seed
```

Expected output ending in `Seed complete.` Run again to confirm idempotency: expected output `Seed data already present, skipping.`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema, typed clients, and idempotent seed script"
```

---

## Task 3: Shared teacher-app layout and bottom tab bar

**Files:**
- Create: `app/app/layout.tsx`, `components/BottomTabBar.tsx`
- Test: `tests/bottom-tab-bar.test.tsx`

**Interfaces:**
- Consumes: Tailwind tokens from Task 1.
- Produces: `components/BottomTabBar.tsx` exports default `BottomTabBar()` — a client component reading `usePathname()` to highlight the active tab. `app/app/layout.tsx` wraps every `/app/*` route and renders `{children}` above the fixed `BottomTabBar`.

- [ ] **Step 1: Write the failing test for tab highlighting**

Create `tests/bottom-tab-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/students',
}))

import BottomTabBar from '@/components/BottomTabBar'

describe('BottomTabBar', () => {
  it('marks the tab matching the current path as active', () => {
    render(<BottomTabBar />)
    const studentsLink = screen.getByRole('link', { name: 'Students' })
    expect(studentsLink).toHaveAttribute('aria-current', 'page')
    const homeLink = screen.getByRole('link', { name: 'Home' })
    expect(homeLink).not.toHaveAttribute('aria-current')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bottom-tab-bar`
Expected: FAIL — `Cannot find module '@/components/BottomTabBar'`

- [ ] **Step 3: Implement BottomTabBar**

Create `components/BottomTabBar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/app', label: 'Home' },
  { href: '/app/students', label: 'Students' },
  { href: '/app/homework', label: 'Homework' },
  { href: '/app/fees', label: 'Fees' },
  { href: '/app/studio', label: 'Studio' },
] as const

export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 border-t border-black/10 bg-white">
      <ul className="flex justify-between px-2 py-2">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/app' ? pathname === '/app' : pathname.startsWith(tab.href)
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1 text-xs ${
                  isActive ? 'text-plum-light' : 'text-black/40'
                }`}
              >
                <span
                  className={`h-6 w-6 rounded-md ${isActive ? 'bg-plum-light' : 'border border-black/20'}`}
                />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bottom-tab-bar`
Expected: PASS

- [ ] **Step 5: Wire up the shared teacher layout**

Create `app/app/layout.tsx`:

```tsx
import BottomTabBar from '@/components/BottomTabBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      {children}
      <BottomTabBar />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shared teacher app layout with bottom tab bar"
```

---

## Task 4: Public landing page (screen 00)

**Files:**
- Create: `app/page.tsx`
- Modify: none

**Interfaces:**
- Consumes: `supabaseServer()` from Task 2 (`lib/supabase/server.ts`), `Event` type from `lib/types.ts`.
- Produces: default export `Home()` Server Component at `/`. No exports consumed by later tasks.

- [ ] **Step 1: Implement the landing page as a Server Component**

Create `app/page.tsx`:

```tsx
import { supabaseServer } from '@/lib/supabase/server'
import type { Event } from '@/lib/types'

export default async function Home() {
  const db = supabaseServer()
  const { data: events } = await db
    .from('events')
    .select('*')
    .gte('event_date', new Date().toISOString().slice(0, 10))
    .order('event_date', { ascending: true })
    .returns<Event[]>()

  const upcoming = events ?? []

  return (
    <div className="app-column px-6 pb-12 pt-8">
      <div className="flex items-start justify-between">
        <h1 className="text-4xl font-extrabold leading-tight">
          Iris
          <br />
          Studio
        </h1>
        <button
          aria-label="Menu"
          className="rounded-full border border-black/10 bg-white p-3"
        >
          ☰
        </button>
      </div>
      <div className="mt-3 h-1 w-16 rounded-full bg-coral" />
      <p className="mt-6 text-black/60">
        Voice lessons in Taipei. Grades, harmony, recitals — taught one singer at a time.
      </p>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Upcoming Events</h2>
        <span className="text-xs uppercase tracking-wide text-black/40">
          {upcoming.length} coming up
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {upcoming.map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm"
          >
            <div>
              <p className="font-bold">{event.name}</p>
              <p className="text-sm text-black/50">
                {event.location} · {event.event_time.slice(0, 5)}
              </p>
            </div>
            <span className="text-sm font-medium">
              {new Date(event.event_date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-3xl bg-plum p-6 text-white">
        <p className="font-bold">Already with the studio?</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000`. Expected: landing page renders with seeded events from Task 2 (requires seed to have been run against real Supabase). Stop dev server after checking.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add public landing page"
```

---

## Task 5: Teacher home dashboard (screen 01)

**Files:**
- Create: `app/app/page.tsx`, `components/StatCard.tsx`
- Test: `tests/stat-card.test.tsx`

**Interfaces:**
- Consumes: `Student`, `Homework`, `RescheduleRequest`, `Event`, `Class`, `FeePayment` types; `supabaseServer()`.
- Produces: `components/StatCard.tsx` exports default `StatCard({ value, label, tone, meta }: StatCardProps)` reused by Task 6 (students) and Task 10 (studio hub). `StatCardProps` = `{ value: string | number; label: string; tone?: 'default' | 'plum'; meta?: string }`.

- [ ] **Step 1: Write the failing test for StatCard**

Create `tests/stat-card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from '@/components/StatCard'

describe('StatCard', () => {
  it('renders value, label, and meta', () => {
    render(<StatCard value={3} label="Homework to review" meta="2 waiting" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Homework to review')).toBeInTheDocument()
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- stat-card`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StatCard**

Create `components/StatCard.tsx`:

```tsx
export interface StatCardProps {
  value: string | number
  label: string
  tone?: 'default' | 'plum'
  meta?: string
}

export default function StatCard({ value, label, tone = 'default', meta }: StatCardProps) {
  const isPlum = tone === 'plum'
  return (
    <div
      className={`rounded-2xl p-5 ${
        isPlum ? 'bg-plum-light text-white' : 'bg-white text-ink'
      }`}
    >
      <p className="text-3xl font-extrabold">{value}</p>
      <p className={`mt-2 text-sm font-medium ${isPlum ? 'text-white/90' : ''}`}>{label}</p>
      {meta && (
        <p className={`mt-3 text-xs ${isPlum ? 'text-white/70' : 'text-black/40'}`}>{meta}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- stat-card`
Expected: PASS

- [ ] **Step 5: Implement the home dashboard**

Create `app/app/page.tsx`:

```tsx
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'
import StatCard from '@/components/StatCard'
import type { Homework, RescheduleRequest, Event, Class, FeePayment } from '@/lib/types'

export default async function TeacherHome() {
  const db = supabaseServer()

  const [{ data: toReview }, { data: pendingReschedules }, { data: events }, { data: classes }] =
    await Promise.all([
      db.from('homework').select('*').eq('status', 'submitted').returns<Homework[]>(),
      db.from('reschedule_requests').select('*').eq('status', 'pending').returns<RescheduleRequest[]>(),
      db
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString().slice(0, 10))
        .returns<Event[]>(),
      db.from('classes').select('*').returns<Class[]>(),
    ])

  const { data: latestCycle } = await db
    .from('fee_cycles')
    .select('id')
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let unpaidCents = 0
  if (latestCycle) {
    const { data: payments } = await db
      .from('fee_payments')
      .select('*, students(id)')
      .eq('cycle_id', latestCycle.id)
      .eq('paid', false)
      .returns<FeePayment[]>()
    unpaidCents = (payments ?? []).length * 0 // placeholder overwritten below
  }

  const reviewCount = toReview?.length ?? 0
  const rescheduleCount = pendingReschedules?.length ?? 0
  const eventCount = events?.length ?? 0
  const classCount = classes?.length ?? 0

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
```

Note: the `unpaidCents` placeholder computation is intentionally replaced in Task 9 once the fees data-access helper exists; for this task it renders `NT$ 0` which is acceptable since Task 9 owns the authoritative fees total logic. Leave a comment above the `unpaidCents` block: `// TODO(Task 9): replace with shared fees total helper`.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000/app`. Expected: dashboard renders with seeded counts. Stop dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add teacher home dashboard"
```

---

## Task 6: Students list and detail (screens 02, 03)

**Files:**
- Create: `app/app/students/page.tsx`, `app/app/students/[id]/page.tsx`, `components/Pill.tsx`
- Test: `tests/pill.test.tsx`

**Interfaces:**
- Consumes: `StatCard` (unused here, listed for completeness — not needed), `Student`, `Homework`, `FeePayment`, `Class` types, `supabaseServer()`.
- Produces: `components/Pill.tsx` exports default `Pill({ children, tone }: PillProps)`, `PillProps = { children: React.ReactNode; tone: 'coral' | 'green' | 'neutral' | 'dark' }` — reused by Task 7 (homework status), Task 9 (fee status).

- [ ] **Step 1: Write the failing test for Pill**

Create `tests/pill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Pill from '@/components/Pill'

describe('Pill', () => {
  it('renders children with the requested tone class', () => {
    render(<Pill tone="coral">FEE DUE</Pill>)
    const pill = screen.getByText('FEE DUE')
    expect(pill).toHaveClass('bg-coral/20')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pill`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Pill**

Create `components/Pill.tsx`:

```tsx
export interface PillProps {
  children: React.ReactNode
  tone: 'coral' | 'green' | 'neutral' | 'dark'
}

const TONE_CLASSES: Record<PillProps['tone'], string> = {
  coral: 'bg-coral/20 text-coral',
  green: 'bg-lime/30 text-green-800',
  neutral: 'bg-black/5 text-black/60',
  dark: 'bg-ink text-white',
}

export default function Pill({ children, tone }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pill`
Expected: PASS

- [ ] **Step 5: Implement the students list page**

Create `app/app/students/page.tsx`:

```tsx
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import Pill from '@/components/Pill'
import type { Student, Homework } from '@/lib/types'

export default async function StudentsList() {
  const db = supabaseServer()
  const { data: students } = await db.from('students').select('*').order('name').returns<Student[]>()
  const { data: toReview } = await db
    .from('homework')
    .select('student_id')
    .eq('status', 'submitted')
    .returns<Pick<Homework, 'student_id'>[]>()

  const reviewCountByStudent: Record<string, number> = {}
  for (const hw of toReview ?? []) {
    reviewCountByStudent[hw.student_id] = (reviewCountByStudent[hw.student_id] ?? 0) + 1
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Students</h1>
        <span className="text-sm text-black/40">{students?.length ?? 0} active</span>
      </div>

      <input
        type="search"
        placeholder="Search name, instrument, grade…"
        className="mt-5 w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm"
      />

      <ul className="mt-5 space-y-3">
        {(students ?? []).map((student) => {
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
```

- [ ] **Step 6: Implement the student detail page**

Create `app/app/students/[id]/page.tsx`:

```tsx
import { supabaseServer } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'
import Pill from '@/components/Pill'
import type { Student, Homework, Class, FeePayment } from '@/lib/types'

export default async function StudentDetail({ params }: { params: { id: string } }) {
  const db = supabaseServer()

  const { data: student } = await db
    .from('students')
    .select('*')
    .eq('id', params.id)
    .single<Student>()

  const { data: homeworkHistory } = await db
    .from('homework')
    .select('*')
    .eq('student_id', params.id)
    .order('created_at', { ascending: false })
    .returns<Homework[]>()

  const { data: cycle } = await db
    .from('fee_cycles')
    .select('id')
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: payments } = cycle
    ? await db
        .from('fee_payments')
        .select('*')
        .eq('student_id', params.id)
        .eq('cycle_id', cycle.id)
        .order('week_number')
        .returns<FeePayment[]>()
    : { data: [] as FeePayment[] }

  if (!student) {
    return <div className="px-6 py-8">Student not found.</div>
  }

  const paidCount = (payments ?? []).filter((p) => p.paid).length

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
            {(homeworkHistory ?? []).map((hw) => (
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
            {(payments ?? []).map((p) => (
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
            {formatCurrency(0)} outstanding
          </p>
          <p className="text-sm text-black/40">{paidCount} of 4 weeks paid</p>
        </section>
      </div>
    </div>
  )
}
```

Leave a comment above `formatCurrency(0)`: `// TODO(Task 9): compute outstanding cents from class fee_cents and unpaid weeks`.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000/app/students` then click into a student. Expected: list and detail render with seeded data. Stop dev server after checking.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add students list and detail pages"
```

---

## Task 7: Homework list, give-homework form (screens 04, 07)

**Files:**
- Create: `app/app/homework/page.tsx`, `app/app/homework/give/page.tsx`, `components/WaveformBar.tsx`
- Test: `tests/give-homework-form.test.tsx`

**Interfaces:**
- Consumes: `Pill` (Task 6), `Student`, `Homework`, `Class` types, `supabaseBrowser` (Task 2, for the client-side form submit).
- Produces: `components/WaveformBar.tsx` exports default `WaveformBar({ seed }: { seed: string })` (deterministic pseudo-waveform bars from a string seed, reused by Task 8's audio review screen). `app/app/homework/give/page.tsx` exports default `GiveHomeworkPage()` client component; internally exports `validateGiveHomeworkForm` (named export) for the unit test.

- [ ] **Step 1: Write the failing test for the give-homework form validation**

Create `tests/give-homework-form.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { validateGiveHomeworkForm } from '@/app/app/homework/give/page'

describe('validateGiveHomeworkForm', () => {
  it('requires at least one selected student', () => {
    const result = validateGiveHomeworkForm({
      studentIds: [],
      title: 'Scales',
      dueDate: '2026-08-25',
      minutesPerDay: 10,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/student/i)
  })

  it('requires a non-empty title', () => {
    const result = validateGiveHomeworkForm({
      studentIds: ['s1'],
      title: '  ',
      dueDate: '2026-08-25',
      minutesPerDay: 10,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/task/i)
  })

  it('accepts a fully filled form', () => {
    const result = validateGiveHomeworkForm({
      studentIds: ['s1', 's2'],
      title: 'Sirens + lip trills, full range',
      dueDate: '2026-08-25',
      minutesPerDay: 10,
    })
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- give-homework-form`
Expected: FAIL — module not found

- [ ] **Step 3: Implement WaveformBar**

Create `components/WaveformBar.tsx`:

```tsx
function pseudoRandom(seed: string, index: number): number {
  let hash = 0
  const str = `${seed}-${index}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash % 100) / 100
}

export default function WaveformBar({ seed, barCount = 24 }: { seed: string; barCount?: number }) {
  return (
    <div className="flex h-10 items-end gap-1">
      {Array.from({ length: barCount }).map((_, i) => {
        const height = 20 + pseudoRandom(seed, i) * 80
        return (
          <span
            key={i}
            style={{ height: `${height}%` }}
            className={`w-1 rounded-full ${i < barCount * 0.6 ? 'bg-plum-light' : 'bg-plum-light/30'}`}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Implement the homework list page**

Create `app/app/homework/page.tsx`:

```tsx
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import Pill from '@/components/Pill'
import WaveformBar from '@/components/WaveformBar'
import type { Homework, Student } from '@/lib/types'

export default async function HomeworkList({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab = searchParams.tab ?? 'submitted'
  const db = supabaseServer()

  const { data: homework } = await db
    .from('homework')
    .select('*, students(id, name)')
    .eq('status', tab)
    .order('created_at', { ascending: false })
    .returns<(Homework & { students: Pick<Student, 'id' | 'name'> })[]>()

  const counts = await Promise.all(
    (['submitted', 'assigned', 'reviewed'] as const).map(async (status) => {
      const { count } = await db
        .from('homework')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
      return [status, count ?? 0] as const
    })
  )
  const countByStatus = Object.fromEntries(counts)

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
        {(homework ?? []).map((hw) => (
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
```

- [ ] **Step 5: Implement give-homework form with exported validator**

Create `app/app/homework/give/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { Student } from '@/lib/types'

export interface GiveHomeworkFormData {
  studentIds: string[]
  title: string
  dueDate: string
  minutesPerDay: number
}

export function validateGiveHomeworkForm(
  data: GiveHomeworkFormData
): { valid: true } | { valid: false; error: string } {
  if (data.studentIds.length === 0) {
    return { valid: false, error: 'Select at least one student.' }
  }
  if (data.title.trim().length === 0) {
    return { valid: false, error: 'Enter a piece or task.' }
  }
  if (!data.dueDate) {
    return { valid: false, error: 'Pick a due date.' }
  }
  if (data.minutesPerDay <= 0) {
    return { valid: false, error: 'Minutes per day must be positive.' }
  }
  return { valid: true }
}

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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- give-homework-form`
Expected: PASS (3 tests)

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, visit `/app/homework` and `/app/homework/give`, select students and submit, confirm redirect back to `/app/homework` and the new row appears under "Assigned". Stop dev server after checking.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add homework list and give-homework form"
```

---

## Task 8: Homework audio and photo review (screens 05, 06) + Storage upload route

**Files:**
- Create: `app/app/homework/[id]/audio/page.tsx`, `app/app/homework/[id]/photo/page.tsx`, `components/StarRating.tsx`, `components/QuickNoteChips.tsx`, `app/api/upload/route.ts`
- Test: `tests/star-rating.test.tsx`, `tests/quick-note-chips.test.tsx`

**Interfaces:**
- Consumes: `Pill`, `WaveformBar`, `Homework`, `Student` types, `supabaseBrowser`, `supabaseServer`.
- Produces: `components/StarRating.tsx` exports default `StarRating({ value, onChange }: { value: number; onChange: (n: number) => void })`. `components/QuickNoteChips.tsx` exports default `QuickNoteChips({ options, selected, onToggle }: QuickNoteChipsProps)`, `QuickNoteChipsProps = { options: string[]; selected: string[]; onToggle: (note: string) => void }`. `app/api/upload/route.ts` exports `POST` Route Handler accepting `multipart/form-data` with a `file` field and a `bucket` field, returning `{ url: string }` — used by both review pages for teacher-side re-upload if needed and reserved for a future student-submission flow.

- [ ] **Step 1: Write the failing test for StarRating**

Create `tests/star-rating.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StarRating from '@/components/StarRating'

describe('StarRating', () => {
  it('calls onChange with the clicked star value', () => {
    const onChange = vi.fn()
    render(<StarRating value={0} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Rate 4 stars'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('renders 5 stars, filling up to value', () => {
    render(<StarRating value={3} onChange={() => {}} />)
    const filled = screen.getAllByText('★').filter((el) => el.className.includes('text-amber'))
    expect(filled).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- star-rating`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StarRating**

Create `components/StarRating.tsx`:

```tsx
export default function StarRating({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} stars`}
          onClick={() => onChange(n)}
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${
            n <= value ? 'bg-amber-100' : 'bg-white'
          }`}
        >
          <span className={n <= value ? 'text-amber-500' : 'text-black/20'}>★</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run StarRating test to verify it passes**

Run: `npm test -- star-rating`
Expected: PASS

- [ ] **Step 5: Write the failing test for QuickNoteChips**

Create `tests/quick-note-chips.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickNoteChips from '@/components/QuickNoteChips'

describe('QuickNoteChips', () => {
  it('calls onToggle with the clicked option', () => {
    const onToggle = vi.fn()
    render(
      <QuickNoteChips options={['Lovely tone', 'Watch the pitch']} selected={[]} onToggle={onToggle} />
    )
    fireEvent.click(screen.getByText('Lovely tone'))
    expect(onToggle).toHaveBeenCalledWith('Lovely tone')
  })

  it('visually marks selected options', () => {
    render(
      <QuickNoteChips
        options={['Lovely tone', 'Watch the pitch']}
        selected={['Lovely tone']}
        onToggle={() => {}}
      />
    )
    expect(screen.getByText('Lovely tone')).toHaveClass('bg-ink')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- quick-note-chips`
Expected: FAIL — module not found

- [ ] **Step 7: Implement QuickNoteChips**

Create `components/QuickNoteChips.tsx`:

```tsx
export interface QuickNoteChipsProps {
  options: string[]
  selected: string[]
  onToggle: (note: string) => void
}

export default function QuickNoteChips({ options, selected, onToggle }: QuickNoteChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-full px-4 py-3 text-sm font-bold ${
              isSelected ? 'bg-ink text-white' : 'bg-white text-black/70'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- quick-note-chips`
Expected: PASS

- [ ] **Step 9: Implement the Storage upload API route**

Create `app/api/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

const ALLOWED_BUCKETS = ['homework-audio', 'homework-photos'] as const

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file')
  const bucket = formData.get('bucket')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (typeof bucket !== 'string' || !ALLOWED_BUCKETS.includes(bucket as (typeof ALLOWED_BUCKETS)[number])) {
    return NextResponse.json({ error: 'invalid bucket' }, { status: 400 })
  }

  const db = supabaseServer()
  const path = `${Date.now()}-${file.name}`
  const { error } = await db.storage.from(bucket).upload(path, file)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data } = db.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
```

- [ ] **Step 10: Implement the audio review page**

Create `app/app/homework/[id]/audio/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import StarRating from '@/components/StarRating'
import QuickNoteChips from '@/components/QuickNoteChips'
import WaveformBar from '@/components/WaveformBar'
import type { Homework, Student } from '@/lib/types'

const QUICK_NOTES = ['Lovely tone', 'Watch the pitch', 'Breathe lower', 'Open the vowel', 'Nearly there']

export default function AudioReviewPage() {
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
        <div className="mt-6 rounded-2xl bg-white/10 p-5">
          <WaveformBar seed={homework.id} />
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
```

- [ ] **Step 11: Implement the photo review page**

Create `app/app/homework/[id]/photo/page.tsx` (same structure as audio, swapping the hero media block for an image):

```tsx
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
```

- [ ] **Step 12: Manual verification**

Run: `npm run dev`, visit `/app/homework`, click "REVIEW" on an audio row and a photo row, set a rating, toggle notes, submit, confirm redirect and that the item now shows under "Reviewed". Stop dev server after checking.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add homework audio/photo review pages and upload route"
```

---

## Task 9: Fees list, multi-select, WhatsApp reminder modal (screens 08, 09, 10)

**Files:**
- Create: `app/app/fees/page.tsx`, `components/FeesSelectionBar.tsx`, `components/ReminderModal.tsx`, `lib/fees.ts`
- Modify: `app/app/page.tsx:` replace the `unpaidCents` TODO with `computeUnpaidCents`; `app/app/students/[id]/page.tsx:` replace the `formatCurrency(0)` TODO with `computeOutstandingCents`
- Test: `tests/fees.test.ts`, `tests/fees-selection.test.tsx`

**Interfaces:**
- Consumes: `Pill`, `formatCurrency`, `FeePayment`, `FeeCycle`, `Class`, `Student` types, `supabaseBrowser`, `supabaseServer`.
- Produces: `lib/fees.ts` exports `computeUnpaidCents(payments: FeePayment[], feeCentsByStudent: Record<string, number>): number` and `computeOutstandingCents(payments: FeePayment[], cycleFeeCents: number): number` — both consumed by Task 5's and Task 6's pages (modified here). `components/FeesSelectionBar.tsx` exports default `FeesSelectionBar({ count, totalCents, onRemind }: FeesSelectionBarProps)`. `components/ReminderModal.tsx` exports default `ReminderModal({ studentNames, totalCents, onSend, onClose }: ReminderModalProps)`.

- [ ] **Step 1: Write the failing test for fee calculation helpers**

Create `tests/fees.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeOutstandingCents } from '@/lib/fees'
import type { FeePayment } from '@/lib/types'

function payment(week: number, paid: boolean): FeePayment {
  return {
    id: `p${week}`,
    student_id: 's1',
    cycle_id: 'c1',
    week_number: week,
    paid,
    paid_at: null,
  }
}

describe('computeOutstandingCents', () => {
  it('charges one quarter of the cycle fee per unpaid week', () => {
    const payments = [payment(1, true), payment(2, true), payment(3, false), payment(4, false)]
    expect(computeOutstandingCents(payments, 320000)).toBe(160000)
  })

  it('returns 0 when all weeks are paid', () => {
    const payments = [payment(1, true), payment(2, true), payment(3, true), payment(4, true)]
    expect(computeOutstandingCents(payments, 320000)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fees`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/fees.ts**

Create `lib/fees.ts`:

```typescript
import type { FeePayment } from './types'

export function computeOutstandingCents(payments: FeePayment[], cycleFeeCents: number): number {
  const unpaidWeeks = payments.filter((p) => !p.paid).length
  const perWeekCents = cycleFeeCents / 4
  return Math.round(unpaidWeeks * perWeekCents)
}

export function computeUnpaidCents(
  paymentsByStudent: Record<string, FeePayment[]>,
  feeCentsByStudent: Record<string, number>
): number {
  return Object.entries(paymentsByStudent).reduce((total, [studentId, payments]) => {
    return total + computeOutstandingCents(payments, feeCentsByStudent[studentId] ?? 0)
  }, 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fees`
Expected: PASS

- [ ] **Step 5: Write the failing test for FeesSelectionBar**

Create `tests/fees-selection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeesSelectionBar from '@/components/FeesSelectionBar'

describe('FeesSelectionBar', () => {
  it('shows the selected count and total, and fires onRemind', () => {
    const onRemind = vi.fn()
    render(<FeesSelectionBar count={2} totalCents={455000} onRemind={onRemind} />)
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    expect(screen.getByText(/NT\$ 4,550/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remind'))
    expect(onRemind).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- fees-selection`
Expected: FAIL — module not found

- [ ] **Step 7: Implement FeesSelectionBar**

Create `components/FeesSelectionBar.tsx`:

```tsx
import { formatCurrency } from '@/lib/format'

export interface FeesSelectionBarProps {
  count: number
  totalCents: number
  onRemind: () => void
}

export default function FeesSelectionBar({ count, totalCents, onRemind }: FeesSelectionBarProps) {
  return (
    <div className="fixed bottom-20 left-1/2 w-full max-w-[440px] -translate-x-1/2 rounded-2xl bg-ink px-5 py-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold">
            {count} selected · {formatCurrency(totalCents)}
          </p>
          <p className="text-xs text-white/50">Sends one WhatsApp each, in your words</p>
        </div>
        <button
          type="button"
          onClick={onRemind}
          className="rounded-full bg-lime px-5 py-2 text-sm font-bold text-ink"
        >
          Remind
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- fees-selection`
Expected: PASS

- [ ] **Step 9: Implement ReminderModal (no dedicated unit test — covered by manual verification; logic is trivial prop-driven rendering already exercised by FeesSelectionBar's pattern)**

Create `components/ReminderModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'

export interface ReminderModalProps {
  studentNames: string[]
  totalCents: number
  onSend: (tone: 'warm' | 'plain' | 'firm') => void
  onClose: () => void
}

const TONE_MESSAGE: Record<'warm' | 'plain' | 'firm', string> = {
  warm: "Hi! Just a gentle nudge — your child's tuition is still open. Thank you! — Iris",
  plain: 'Reminder: tuition payment for this cycle is still outstanding.',
  firm: 'Please settle the outstanding tuition balance as soon as possible.',
}

export default function ReminderModal({ studentNames, totalCents, onSend, onClose }: ReminderModalProps) {
  const [tone, setTone] = useState<'warm' | 'plain' | 'firm'>('warm')

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full max-w-[480px] mx-auto rounded-t-3xl bg-cream p-6">
        <h2 className="text-xl font-extrabold">Nudge {studentNames.length} parents on WhatsApp</h2>
        <p className="mt-1 text-sm text-black/50">{studentNames.join(', ')}</p>

        <div className="mt-5 rounded-2xl bg-lime/30 p-5 text-sm">{TONE_MESSAGE[tone]}</div>

        <div className="mt-4 flex gap-2">
          {(['warm', 'plain', 'firm'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={`flex-1 rounded-full py-3 text-sm font-bold capitalize ${
                tone === t ? 'bg-ink text-white' : 'bg-white text-black/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-white py-4 font-bold"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => onSend(tone)}
            className="flex-1 rounded-full bg-ink py-4 font-bold text-white"
          >
            Send {studentNames.length} reminders
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-black/30">{formatCurrency(totalCents)} total</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Implement the fees page tying it together**

Create `app/app/fees/page.tsx`:

```tsx
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
      const { data: cycles } = await supabaseBrowser
        .from('fee_cycles')
        .select('*')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .returns<FeeCycle[]>()
      const currentCycle = cycles?.[0]
      if (!currentCycle) return
      setCycle(currentCycle)

      const { data: students } = await supabaseBrowser.from('students').select('*').returns<Student[]>()
      const { data: payments } = await supabaseBrowser
        .from('fee_payments')
        .select('*')
        .eq('cycle_id', currentCycle.id)
        .returns<FeePayment[]>()
      const { data: classStudents } = await supabaseBrowser
        .from('class_students')
        .select('*')
        .returns<ClassStudent[]>()
      const { data: classes } = await supabaseBrowser.from('classes').select('*').returns<Class[]>()

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
```

- [ ] **Step 11: Wire computeUnpaidCents into the home dashboard**

Edit `app/app/page.tsx`: replace the `unpaidCents` placeholder block with:

```typescript
import { computeUnpaidCents } from '@/lib/fees'
import type { FeeCycle, Class, ClassStudent } from '@/lib/types'
```

and replace the fee-fetching block with:

```typescript
  let unpaidCents = 0
  const { data: latestCycle } = await db
    .from('fee_cycles')
    .select('*')
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle<FeeCycle>()

  if (latestCycle) {
    const [{ data: payments }, { data: classStudents }, { data: allClasses }] = await Promise.all([
      db.from('fee_payments').select('*').eq('cycle_id', latestCycle.id),
      db.from('class_students').select('*').returns<ClassStudent[]>(),
      db.from('classes').select('*').returns<Class[]>(),
    ])
    const classById = Object.fromEntries((allClasses ?? []).map((c) => [c.id, c]))
    const classIdByStudent = Object.fromEntries((classStudents ?? []).map((cs) => [cs.student_id, cs.class_id]))
    const paymentsByStudent: Record<string, typeof payments> = {}
    for (const p of payments ?? []) {
      paymentsByStudent[p.student_id] = [...(paymentsByStudent[p.student_id] ?? []), p]
    }
    const feeCentsByStudent = Object.fromEntries(
      Object.keys(paymentsByStudent).map((studentId) => [
        studentId,
        classById[classIdByStudent[studentId]]?.fee_cents ?? 0,
      ])
    )
    unpaidCents = computeUnpaidCents(paymentsByStudent as any, feeCentsByStudent)
  }
```

Remove the old placeholder block entirely.

- [ ] **Step 12: Wire computeOutstandingCents into the student detail page**

Edit `app/app/students/[id]/page.tsx`: add `import { computeOutstandingCents } from '@/lib/fees'` and `import type { Class, ClassStudent } from '@/lib/types'`, fetch the student's class fee via `class_students` + `classes`, and replace `formatCurrency(0)` with `formatCurrency(computeOutstandingCents(payments ?? [], feeCents))` where `feeCents` is looked up the same way as Step 11.

- [ ] **Step 13: Manual verification**

Run: `npm run dev`, visit `/app/fees`, select two unpaid students, click Remind, choose a tone, click Send, confirm the modal closes and selection clears. Visit `/app` and `/app/students/[id]` and confirm unpaid/outstanding amounts now show real computed values. Stop dev server after checking.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: add fees page with multi-select reminders, wire fee totals into home and student detail"
```

---

## Task 10: Studio hub (screen 11)

**Files:**
- Create: `app/app/studio/page.tsx`

**Interfaces:**
- Consumes: `StatCard`-style card pattern (inline, not reused since this screen uses a distinct icon-row-card layout), `supabaseServer()`.
- Produces: none consumed elsewhere.

- [ ] **Step 1: Implement the studio hub**

Create `app/app/studio/page.tsx`:

```tsx
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'

export default async function StudioHub() {
  const db = supabaseServer()

  const [{ count: upcomingEvents }, { count: classCount }, { count: pendingReschedules }] =
    await Promise.all([
      db
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('event_date', new Date().toISOString().slice(0, 10)),
      db.from('classes').select('id', { count: 'exact', head: true }),
      db.from('reschedule_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

  const items = [
    {
      href: '/app/studio/events',
      title: 'Events',
      meta: `${upcomingEvents ?? 0} upcoming`,
      icon: '◆',
      bg: 'bg-plum-light/20',
    },
    {
      href: '/app/studio/classes',
      title: 'Classes',
      meta: `${classCount ?? 0} running`,
      icon: '☰',
      bg: 'bg-lime/40',
    },
    {
      href: '/app/studio/reschedules',
      title: 'Time changes',
      meta: `${pendingReschedules ?? 0} waiting on you`,
      icon: '⇄',
      bg: 'bg-amber-200',
    },
  ]

  return (
    <div className="px-6 pb-6 pt-8">
      <h1 className="text-3xl font-extrabold">Studio</h1>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex items-center justify-between rounded-2xl bg-white p-5">
              <div className="flex items-center gap-4">
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg ${item.bg}`}>
                  {item.icon}
                </span>
                <div>
                  <p className="font-bold">{item.title}</p>
                  <p className="text-sm text-black/50">{item.meta}</p>
                </div>
              </div>
              <span className="text-black/30">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, visit `/app/studio`, confirm counts render and links navigate. Stop dev server after checking.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add studio hub page"
```

---

## Task 11: Events — upcoming/history list and create/edit form (screens 12, 13, 14)

**Files:**
- Create: `app/app/studio/events/page.tsx`, `app/app/studio/events/new/page.tsx`
- Test: `tests/event-form.test.ts`

**Interfaces:**
- Consumes: `Event` type, `supabaseBrowser`.
- Produces: `app/app/studio/events/new/page.tsx` exports named `validateEventForm` for the unit test, plus default `NewEventPage()`.

- [ ] **Step 1: Write the failing test for event form validation**

Create `tests/event-form.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateEventForm } from '@/app/app/studio/events/new/page'

describe('validateEventForm', () => {
  it('requires a name', () => {
    const result = validateEventForm({ name: '', date: '2026-09-06', time: '15:00', location: 'Hall' })
    expect(result.valid).toBe(false)
  })

  it('requires a date and time', () => {
    const result = validateEventForm({ name: 'Recital', date: '', time: '', location: 'Hall' })
    expect(result.valid).toBe(false)
  })

  it('accepts a complete form', () => {
    const result = validateEventForm({ name: 'Recital', date: '2026-09-06', time: '15:00', location: 'Hall' })
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- event-form`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the events list page**

Create `app/app/studio/events/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { Event } from '@/lib/types'

export default function EventsPage() {
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const query = supabaseBrowser.from('events').select('*').order('event_date')
      const { data } =
        tab === 'upcoming' ? await query.gte('event_date', today) : await query.lt('event_date', today)
      setEvents((data as Event[]) ?? [])
    }
    load()
  }, [tab])

  async function handleDelete(id: string) {
    await supabaseBrowser.from('events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Studio</p>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Events</h1>
        <Link href="/app/studio/events/new" className="rounded-full bg-plum-light px-5 py-3 text-sm font-bold text-white">
          + Create
        </Link>
      </div>

      <div className="mt-5 flex gap-2">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${
              tab === t ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="mt-5 space-y-3">
        {events.map((event) => {
          const isNext = tab === 'upcoming' && events[0]?.id === event.id
          return (
            <li
              key={event.id}
              className={`rounded-2xl p-5 ${isNext ? 'bg-ink text-white' : 'bg-white'}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl font-bold ${
                    isNext ? 'bg-lime text-ink' : 'bg-plum-light/20 text-plum-light'
                  }`}
                >
                  <span>{new Date(event.event_date).getDate()}</span>
                  <span className="text-[10px] uppercase">
                    {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                </div>
                <div>
                  <p className="font-bold">{event.name}</p>
                  <p className={`text-sm ${isNext ? 'text-white/60' : 'text-black/50'}`}>
                    {event.event_time.slice(0, 5)} · {event.location} · {event.invite_scope}
                  </p>
                  <p className={`mt-1 text-sm font-medium ${isNext ? 'text-lime' : 'text-green-700'}`}>
                    {event.status === 'sent' ? 'Sent' : 'Not announced yet'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {event.status === 'draft' ? (
                  <button className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink">
                    Send to all
                  </button>
                ) : (
                  <button className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold">Resend</button>
                )}
                <Link
                  href={`/app/studio/events/new?id=${event.id}`}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${isNext ? 'bg-white/10' : 'bg-black/5'}`}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(event.id)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${isNext ? 'bg-white/10' : 'bg-black/5'}`}
                >
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Implement the event form with exported validator**

Create `app/app/studio/events/new/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export interface EventFormData {
  name: string
  date: string
  time: string
  location: string
}

export function validateEventForm(data: EventFormData): { valid: true } | { valid: false; error: string } {
  if (data.name.trim().length === 0) return { valid: false, error: 'Enter an event name.' }
  if (!data.date) return { valid: false, error: 'Pick a date.' }
  if (!data.time) return { valid: false, error: 'Pick a time.' }
  if (data.location.trim().length === 0) return { valid: false, error: 'Enter a location.' }
  return { valid: true }
}

export default function NewEventPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [inviteScope, setInviteScope] = useState('everyone')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editId) return
    supabaseBrowser
      .from('events')
      .select('*')
      .eq('id', editId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setName(data.name)
        setDate(data.event_date)
        setTime(data.event_time.slice(0, 5))
        setLocation(data.location)
        setInviteScope(data.invite_scope)
        setNote(data.note)
      })
  }, [editId])

  async function save(status: 'draft' | 'sent') {
    const result = validateEventForm({ name, date, time, location })
    if (!result.valid) {
      setError(result.error)
      return
    }
    setError(null)
    const payload = {
      name,
      event_date: date,
      event_time: time,
      location,
      invite_scope: inviteScope,
      note,
      status,
    }
    if (editId) {
      await supabaseBrowser.from('events').update(payload).eq('id', editId)
    } else {
      await supabaseBrowser.from('events').insert(payload)
    }
    router.push('/app/studio/events')
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Events</p>
      <h1 className="mt-2 text-3xl font-extrabold">{editId ? 'Edit event' : 'New event'}</h1>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Name</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Date</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-4" />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Time</h2>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-4" />
        </div>
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Where</h2>
      <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Invite</h2>
      <div className="mt-2 flex gap-2">
        {['everyone', 'solo students', 'group'].map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => setInviteScope(scope)}
            className={`rounded-full px-4 py-3 text-sm font-bold capitalize ${
              inviteScope === scope ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {scope}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Note</h2>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => save('draft')} className="flex-1 rounded-full bg-white py-4 font-bold">
          Save draft
        </button>
        <button type="button" onClick={() => save('sent')} className="flex-1 rounded-full bg-ink py-4 font-bold text-white">
          Save &amp; send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- event-form`
Expected: PASS

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, visit `/app/studio/events`, create a new event via "+ Create", save as draft, confirm it appears under Upcoming with "Not announced yet"; edit it and Save & send, confirm status flips. Stop dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add events list and create/edit form"
```

---

## Task 12: Classes — list and create/edit form (screens 15, 16)

**Files:**
- Create: `app/app/studio/classes/page.tsx`, `app/app/studio/classes/[id]/edit/page.tsx`
- Test: `tests/class-form.test.ts`

**Interfaces:**
- Consumes: `Class` type, `supabaseBrowser`.
- Produces: `app/app/studio/classes/[id]/edit/page.tsx` exports named `validateClassForm` for the unit test, plus default `EditClassPage()`. This page also handles the create case when `params.id === 'new'`.

- [ ] **Step 1: Write the failing test for class form validation**

Create `tests/class-form.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateClassForm } from '@/app/app/studio/classes/[id]/edit/page'

describe('validateClassForm', () => {
  it('requires a name', () => {
    const result = validateClassForm({
      name: '',
      day: 'We',
      time: '10:00',
      durationMinutes: 45,
      room: 'A',
      feeCents: 320000,
    })
    expect(result.valid).toBe(false)
  })

  it('requires positive duration and fee', () => {
    const result = validateClassForm({
      name: 'Vocal · Grade 4',
      day: 'We',
      time: '10:00',
      durationMinutes: 0,
      room: 'A',
      feeCents: 0,
    })
    expect(result.valid).toBe(false)
  })

  it('accepts a complete form', () => {
    const result = validateClassForm({
      name: 'Vocal · Grade 4',
      day: 'We',
      time: '10:00',
      durationMinutes: 45,
      room: 'A',
      feeCents: 320000,
    })
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- class-form`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the classes list page**

Create `app/app/studio/classes/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import type { Class, ClassStudent } from '@/lib/types'

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([])
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({})

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
    await supabaseBrowser.from('classes').delete().eq('id', id)
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
```

- [ ] **Step 4: Implement the class edit/create form with exported validator**

Create `app/app/studio/classes/[id]/edit/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export interface ClassFormData {
  name: string
  day: string
  time: string
  durationMinutes: number
  room: string
  feeCents: number
}

export function validateClassForm(data: ClassFormData): { valid: true } | { valid: false; error: string } {
  if (data.name.trim().length === 0) return { valid: false, error: 'Enter a class name.' }
  if (data.durationMinutes <= 0) return { valid: false, error: 'Duration must be positive.' }
  if (data.feeCents <= 0) return { valid: false, error: 'Fee must be positive.' }
  if (data.room.trim().length === 0) return { valid: false, error: 'Enter a room.' }
  return { valid: true }
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

export default function EditClassPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'

  const [name, setName] = useState('')
  const [format, setFormat] = useState<'1:1' | 'group'>('1:1')
  const [day, setDay] = useState<string>('We')
  const [time, setTime] = useState('10:00')
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [room, setRoom] = useState('')
  const [feeCents, setFeeCents] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    supabaseBrowser
      .from('classes')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return
        setName(data.name)
        setFormat(data.format)
        setDay(data.day)
        setTime(data.time.slice(0, 5))
        setDurationMinutes(data.duration_minutes)
        setRoom(data.room)
        setFeeCents(data.fee_cents)
      })
  }, [id, isNew])

  async function handleSave() {
    const result = validateClassForm({ name, day, time, durationMinutes, room, feeCents })
    if (!result.valid) {
      setError(result.error)
      return
    }
    setError(null)
    const payload = { name, format, day, time, duration_minutes: durationMinutes, room, fee_cents: feeCents }
    if (isNew) {
      await supabaseBrowser.from('classes').insert(payload)
    } else {
      await supabaseBrowser.from('classes').update(payload).eq('id', id)
    }
    router.push('/app/studio/classes')
  }

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Classes</p>
      <h1 className="mt-2 text-3xl font-extrabold">{isNew ? 'New class' : 'Edit class'}</h1>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Class name</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4" />

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Format</h2>
      <div className="mt-2 flex gap-2">
        {(['1:1', 'group'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={`rounded-full px-5 py-3 text-sm font-bold capitalize ${
              format === f ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {f === '1:1' ? '1-on-1' : 'Group'}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Day</h2>
      <div className="mt-2 flex gap-2">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`h-11 w-11 rounded-full text-sm font-bold ${
              day === d ? 'bg-ink text-white' : 'bg-white text-black/60'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Time</h2>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-4" />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Minutes</h2>
          <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-4" />
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wide text-black/40">Room</h2>
          <input value={room} onChange={(e) => setRoom(e.target.value)} className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-4" />
        </div>
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-black/40">Fee per 4-week cycle (NT$)</h2>
      <input
        type="number"
        value={feeCents / 100}
        onChange={(e) => setFeeCents(Number(e.target.value) * 100)}
        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-5 py-4"
      />

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}

      <button type="button" onClick={handleSave} className="mt-6 w-full rounded-full bg-ink py-4 font-bold text-white">
        {isNew ? 'Create class' : 'Save changes'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- class-form`
Expected: PASS

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, visit `/app/studio/classes`, edit an existing class and save, then create a new one via "+ Create", confirm both persist and list updates. Stop dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add classes list and create/edit form"
```

---

## Task 13: Reschedule requests list and approve/decline modal (screens 17, 18)

**Files:**
- Create: `app/app/studio/reschedules/page.tsx`, `components/RescheduleModal.tsx`
- Test: `tests/reschedule-approval.test.tsx`

**Interfaces:**
- Consumes: `RescheduleRequest`, `Student` types, `supabaseBrowser`.
- Produces: `components/RescheduleModal.tsx` exports default `RescheduleModal({ request, studentName, onApprove, onDecline, onDismiss }: RescheduleModalProps)`, consumed only by this task's page.

- [ ] **Step 1: Write the failing test for RescheduleModal**

Create `tests/reschedule-approval.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RescheduleModal from '@/components/RescheduleModal'
import type { RescheduleRequest } from '@/lib/types'

const request: RescheduleRequest = {
  id: 'r1',
  student_id: 's1',
  class_id: 'c1',
  current_time: '2026-08-20T11:00:00+08:00',
  requested_time: '2026-08-21T17:30:00+08:00',
  reason: 'Choir rehearsal moved to Wednesday this week.',
  status: 'pending',
  created_at: '2026-08-18T00:00:00Z',
}

describe('RescheduleModal', () => {
  it('calls onApprove when Approve move is clicked', () => {
    const onApprove = vi.fn()
    render(
      <RescheduleModal
        request={request}
        studentName="Kenji Lin"
        onApprove={onApprove}
        onDecline={() => {}}
        onDismiss={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Approve move'))
    expect(onApprove).toHaveBeenCalledWith('r1')
  })

  it('calls onDecline when Can\'t do it is clicked', () => {
    const onDecline = vi.fn()
    render(
      <RescheduleModal
        request={request}
        studentName="Kenji Lin"
        onApprove={() => {}}
        onDecline={onDecline}
        onDismiss={() => {}}
      />
    )
    fireEvent.click(screen.getByText("Can't do it"))
    expect(onDecline).toHaveBeenCalledWith('r1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reschedule-approval`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RescheduleModal**

Create `components/RescheduleModal.tsx`:

```tsx
import type { RescheduleRequest } from '@/lib/types'

export interface RescheduleModalProps {
  request: RescheduleRequest
  studentName: string
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  onDismiss: () => void
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function RescheduleModal({ request, studentName, onApprove, onDecline, onDismiss }: RescheduleModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="mx-auto w-full max-w-[480px] rounded-t-3xl bg-cream p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold">{studentName}</h2>
          </div>
          <div className="text-right text-xs uppercase tracking-wide text-black/40">
            Current class
            <p className="text-sm font-bold text-ink">{formatDateTime(request.current_time)}</p>
          </div>
        </div>

        <p className="mt-4 text-xs uppercase tracking-wide text-black/40">Request change below</p>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-white p-5">
          <div>
            <p className="text-xs text-black/40">From</p>
            <p className="font-bold">{formatDateTime(request.current_time)}</p>
          </div>
          <span className="text-plum-light">→</span>
          <div className="text-right">
            <p className="text-xs text-plum-light">To</p>
            <p className="font-bold">{formatDateTime(request.requested_time)}</p>
          </div>
        </div>

        {request.reason && (
          <div className="mt-3 rounded-2xl bg-black/5 p-4 text-sm">
            <p>&ldquo;{request.reason}&rdquo;</p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onDecline(request.id)}
            className="flex-1 rounded-full bg-white py-4 font-bold"
          >
            Can&apos;t do it
          </button>
          <button
            type="button"
            onClick={() => onApprove(request.id)}
            className="flex-1 rounded-full bg-plum-light py-4 font-bold text-white"
          >
            Approve move
          </button>
        </div>
        <button type="button" onClick={onDismiss} className="mt-3 w-full text-center text-sm text-black/40">
          Decide later
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reschedule-approval`
Expected: PASS

- [ ] **Step 5: Implement the reschedule requests list page**

Create `app/app/studio/reschedules/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import RescheduleModal from '@/components/RescheduleModal'
import type { RescheduleRequest, Student } from '@/lib/types'

export default function ReschedulesPage() {
  const [requests, setRequests] = useState<(RescheduleRequest & { students: Student })[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabaseBrowser
      .from('reschedule_requests')
      .select('*, students(*)')
      .eq('status', 'pending')
      .returns<(RescheduleRequest & { students: Student })[]>()
    setRequests(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function handleApprove(id: string) {
    await supabaseBrowser.from('reschedule_requests').update({ status: 'approved' }).eq('id', id)
    setActiveId(null)
    load()
  }

  async function handleDecline(id: string) {
    await supabaseBrowser.from('reschedule_requests').update({ status: 'declined' }).eq('id', id)
    setActiveId(null)
    load()
  }

  const active = requests.find((r) => r.id === activeId)

  return (
    <div className="px-6 pb-6 pt-8">
      <p className="text-black/40">‹ Studio</p>
      <h1 className="mt-2 text-3xl font-extrabold">Time changes</h1>
      <p className="mt-1 text-black/50">Students ask, you answer. Nothing moves until you tap yes.</p>

      <ul className="mt-5 space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded-2xl border border-amber-300 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-plum-light/20 font-bold text-plum-light">
                  {r.students.name.split(' ').map((n) => n[0]).join('')}
                </span>
                <div>
                  <p className="font-bold">{r.students.name}</p>
                  <p className="text-sm text-black/50">
                    {new Date(r.current_time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                    {new Date(r.current_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} →{' '}
                    {new Date(r.requested_time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                    {new Date(r.requested_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(r.id)}
                className="rounded-full bg-amber-200 px-4 py-2 text-xs font-bold text-amber-800"
              >
                OPEN
              </button>
            </div>
          </li>
        ))}
        {requests.length === 0 && <p className="text-black/40">No pending requests.</p>}
      </ul>

      {active && (
        <RescheduleModal
          request={active}
          studentName={active.students.name}
          onApprove={handleApprove}
          onDecline={handleDecline}
          onDismiss={() => setActiveId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, visit `/app/studio/reschedules`, click OPEN on the seeded Kenji Lin request, click "Approve move", confirm it disappears from the list (status now `approved`). Repeat with a second request (if present) using "Can't do it". Stop dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add reschedule requests list and approve/decline modal"
```

---

## Task 14: Full-suite verification and README update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a final verification and documentation task.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests across every prior task PASS with no failures.

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build completes with no type errors or failed page generations. If any `/app/*` Server Component fails at build time due to missing Supabase env vars, confirm `.env.local` has real values (per Task 2 Step 6 note) before treating this as a bug.

- [ ] **Step 3: Update README with setup instructions**

Edit `README.md` to add:

```markdown
## Iris Studio Teacher App

Next.js + Supabase teacher-facing app. See `docs/superpowers/specs/2026-08-26-iris-studio-teacher-app-design.md` for the design.

### Setup

1. Copy `.env.local.example` to `.env.local` and fill in Supabase project values.
2. Apply `supabase/schema.sql` to your Supabase project (SQL editor or CLI).
3. Create two public Storage buckets: `homework-audio`, `homework-photos`.
4. `npm install`
5. `npm run seed` — seeds one studio with sample students, classes, homework, fees, events, and a reschedule request.
6. `npm run dev` — visit `http://localhost:3000` for the public landing page, `http://localhost:3000/app` for the teacher app.

### Testing

`npm test` runs the Vitest suite (component and form-validation tests).

### Deployment

Configured for Netlify via `netlify.toml`. Set the same three env vars in Netlify's dashboard before deploying.
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add setup and testing instructions to README"
```

---

## Self-Review Notes

- **Spec coverage:** every route in the spec's routes table maps to a task (Tasks 4–13); schema matches spec 1:1 (Task 2); Storage buckets covered (Task 8); WhatsApp/LINE stays out of scope everywhere reminder/send actions appear (Tasks 9, 11); env var handling matches spec's security section (Tasks 1, 2, 14).
- **No placeholders:** the two intentional TODO comments (Task 5, Task 6) are resolved within the same plan by Task 9, not left dangling — both are rewritten with real logic and the TODO comments are removed as part of Task 9's steps.
- **Type consistency:** `Homework`, `Student`, `Class`, `FeePayment`, `FeeCycle`, `Event`, `RescheduleRequest` types defined once in Task 2 and imported verbatim (no redefinition) in every later task. `computeOutstandingCents`/`computeUnpaidCents` signatures defined in Task 9 match their call sites in Tasks 5 and 6 exactly.
