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
