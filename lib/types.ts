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
