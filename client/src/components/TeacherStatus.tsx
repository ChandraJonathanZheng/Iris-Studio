import { initialOf } from '../lib/date';
import type { TeacherPublic, TeacherStatus } from '../lib/types';

export const TEACHER_STATUS_LABEL: Record<TeacherStatus, string> = { normal: '正常上課', vacation: '放假中', noNewStudents: '暫停接新學生', custom: '自訂' };
export const statusText = (t: Pick<TeacherPublic, 'status' | 'statusLabel'>) =>
  t.status === 'custom' ? (t.statusLabel?.trim() || '自訂狀態') : TEACHER_STATUS_LABEL[t.status];

/**
 * Iris as students see her: photo, name, status, note, contact LINE ID (only if she made it public).
 * One component for both places — the student's home and the live preview on 教師個人資料 —
 * so the preview can never drift from what students really get.
 */
export function TeacherStatusCard({ t, preview }: { t: TeacherPublic; preview?: boolean }) {
  const normal = t.status === 'normal';
  return (
    <section className={`tsc${normal ? '' : ' away'}`} aria-label={preview ? '學生看到的樣子（預覽）' : `${t.name} 老師的狀態`}>
      <span className="tsc-av" aria-hidden="true">{t.avatarUrl ? <img src={t.avatarUrl} alt="" /> : initialOf(t.name)}</span>
      <div className="tsc-body">
        <p className="tsc-name">{t.name} 老師</p>
        {/* shape + word, not colour alone: ● = teaching as usual, ◆ = something to know */}
        <p className={`tsc-status${normal ? ' ok' : ' warn'}`}>{normal ? '●' : '◆'} {statusText(t)}</p>
        {t.statusMessage && <p className="tsc-msg">{t.statusMessage}</p>}
        {t.lineId && <p className="tsc-line">LINE ID：<b>{t.lineId}</b></p>}
      </div>
    </section>
  );
}
