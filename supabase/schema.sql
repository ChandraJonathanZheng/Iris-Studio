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
