import { passwordChecks } from '../lib/password';
export function PasswordRules({ value, history = false }: { value: string; history?: boolean }) {
  return <div className="password-rules" aria-label="密碼規則"><ul>{passwordChecks(value).map((c) =>
    <li key={c.label} className={c.ok ? 'ok' : undefined}><span aria-hidden>{c.ok ? '✓' : '○'}</span> {c.label}</li>)}</ul>
    {history && <p className="cap">不能和最近 3 次的密碼相同。</p>}</div>;
}
