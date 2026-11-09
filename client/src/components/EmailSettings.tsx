import { useMe, useResendVerification, useSaveNotificationPrefs } from '../lib/queries';
import type { NotificationPrefs } from '../lib/types';
import { ApiError } from '../lib/api';
import { useToast } from './Toast';

const TEXT = {
  Student: {
    emailUpdates: ['預約與堂數通知', '預約成功、取消、改時間結果、堂數調整。'],
    emailReminders: ['上課與續購提醒', '上課前 24 小時提醒，以及堂數快用完時的提醒。'],
  },
  Teacher: {
    emailUpdates: ['學生動態通知', '新的學生申請、待確認付款、改時間申請、新的諮詢。'],
    emailReminders: ['提醒', ''], // no reminder emails go to the teacher, so this switch isn't shown
  },
} as const;

/**
 * Email 通知: verification state + the two optional email groups. Account, security and payment emails
 * (verification, password reset, receipts, payment results) can't be turned off — said plainly below.
 */
export function EmailSettings() {
  const me = useMe().data;
  const save = useSaveNotificationPrefs();
  const resend = useResendVerification();
  const toast = useToast();
  if (!me) return null;
  const text = TEXT[me.role];
  const prefs: NotificationPrefs = { emailUpdates: me.emailUpdates, emailReminders: me.emailReminders };
  const change = (k: keyof NotificationPrefs) => {
    const on = !prefs[k];
    save.mutate({ ...prefs, [k]: on }, {
      onSuccess: () => toast({ text: on ? '已開啟 Email 通知' : '已關閉，這類通知不會再寄 Email' }),
      onError: (e) => toast({ text: e instanceof ApiError ? e.message : '儲存失敗，請再試一次。', kind: 'error' }),
    });
  };
  const keys: (keyof NotificationPrefs)[] = me.role === 'Teacher' ? ['emailUpdates'] : ['emailUpdates', 'emailReminders'];
  return (
    <section className="card cn-card" aria-labelledby="em-h">
      <h2 className="h3" id="em-h">Email 通知</h2>
      {me.role === 'Teacher' ? null : me.email ? ( // the teacher sees her address under 登入方式
        <div className="cn-row">
          <div><p className="t">{me.email}</p>
            <p className={`cn-state ${me.emailVerified ? 'on' : ''}`}>{me.emailVerified ? '● 已驗證' : '○ 尚未驗證，請點驗證信中的連結'}</p></div>
          {!me.emailVerified && (
            <button className="btn secondary sm" disabled={resend.isPending}
              onClick={() => resend.mutate(undefined, {
                onSuccess: () => toast({ text: `驗證信已寄到 ${me.email}` }),
                onError: (e) => toast({ text: e instanceof ApiError ? e.message : '寄送失敗，請稍後再試。', kind: 'error' }),
              })}>重新寄送</button>
          )}
        </div>
      ) : <p className="caption">填寫 Email 後，就能收到預約與付款通知。</p>}
      {keys.map((k) => (
        <div className="cn-row" key={k}>
          <div><p className="t" id={`em-${k}`}>{text[k][0]}</p><p className="caption" id={`em-${k}-d`}>{text[k][1]}</p></div>
          <button className="switch" role="switch" aria-checked={prefs[k]} aria-labelledby={`em-${k}`} aria-describedby={`em-${k}-d`}
            disabled={save.isPending || !me.email} onClick={() => change(k)} />
        </div>
      ))}
      <p className="caption">帳號與安全相關的 Email（驗證、重設密碼）{me.role === 'Student' ? '，以及收據與付款結果，' : ''}一律會寄送。{me.role === 'Student' ? '行銷訊息請到「同意設定」調整。' : ''}</p>
    </section>
  );
}
