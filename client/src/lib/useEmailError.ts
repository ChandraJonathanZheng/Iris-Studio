import { useEffect, useState } from 'react';
export const emailProblem = (value: string) => !value.trim() ? 'Email 不能空白。' : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.trim().length <= 200 ? '' : '請填寫正確的 Email。';
export function useEmailError(value: string, tried: boolean) {
  const [checked, setChecked] = useState<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => setChecked(value), 600); return () => window.clearTimeout(timer); }, [value]);
  return tried || (value && checked === value) ? emailProblem(value) : '';
}
