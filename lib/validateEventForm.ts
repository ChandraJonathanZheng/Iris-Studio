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
