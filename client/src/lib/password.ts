/** Password rule for sign-up and reset. The server checks the same rule (PasswordService.RuleProblem). */
export const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: '至少 8 個字元', test: (v) => v.length >= 8 },
  { label: '至少 1 個大寫字母', test: (v) => /[A-Z]/.test(v) },
  { label: '至少 1 個小寫字母', test: (v) => /[a-z]/.test(v) },
  { label: '至少 1 個數字', test: (v) => /[0-9]/.test(v) },
];
export const passwordOk = (v: string) => v.length <= 128 && PASSWORD_RULES.every((r) => r.test(v));
