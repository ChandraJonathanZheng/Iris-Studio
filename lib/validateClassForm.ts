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
