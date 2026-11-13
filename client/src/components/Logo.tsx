import full from '../assets/logo-full.svg?raw';
import mark from '../assets/logo-mark.svg?raw';

/**
 * Iris Vocal Studio logo, traced from the studio's real sign.
 * Inline SVG (not <img>) so it takes the text colour via `currentColor` and stays sharp at any size.
 * `mark` = "Iris + mic" for small places (top bars); `full` = with "vocal / studio" for login and big spots.
 * Decorative here: the link around it already carries the accessible name.
 */
export function Logo({ variant = 'mark', className }: { variant?: 'mark' | 'full'; className?: string }) {
  return <span className={`iris-logo iris-logo-${variant} ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: variant === 'full' ? full : mark }} />;
}
