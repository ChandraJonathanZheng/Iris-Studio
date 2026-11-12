import full from '../assets/iris-logo-full.svg?raw';
import mark from '../assets/iris-logo-mark.svg?raw';

/** The hand-lettered "Iris" logo. mark = word only (header, sidebar) · full = word + "Vocal Studio" line (about section). */
export function IrisLogo({ variant = 'mark', className }: { variant?: 'mark' | 'full'; className?: string }) {
  return (
    <span
      className={`iris-logo iris-logo-${variant} ${className ?? ''}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: variant === 'full' ? full : mark }}
    />
  );
}
