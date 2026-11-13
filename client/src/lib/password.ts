/**
 * Sign-up password rule, shared by the form (live checklist) and the mock API.
 * The server checks the same thing in PublicAuthEndpoints (register).
 */
export const PW_RULES = [
  { label: '至少 8 個字元', test: (p: string) => p.length >= 8 },
  { label: '至少 1 個大寫字母', test: (p: string) => /[A-Z]/.test(p) },
  { label: '至少 1 個小寫字母', test: (p: string) => /[a-z]/.test(p) },
  { label: '至少 1 個數字', test: (p: string) => /[0-9]/.test(p) },
];
