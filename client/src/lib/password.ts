export const passwordChecks = (value: string) => [
  { label: '至少 8 個字元', ok: value.length >= 8 && value.length <= 128 },
  { label: '大寫字母', ok: /[A-Z]/.test(value) },
  { label: '小寫字母', ok: /[a-z]/.test(value) },
  { label: '數字', ok: /[0-9]/.test(value) },
];
export const validPassword = (value: string) => passwordChecks(value).every((c) => c.ok);
export const passwordProblem = (value: string) => !value ? '密碼不能空白。' : validPassword(value) ? '' : '密碼需要 8–128 個字元，並包含大寫字母、小寫字母和數字。';
