import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Drawer } from 'vaul';
import { Icon } from './Icon';

/** Close a route-sheet: step back in history (so Back doesn't reopen it); on a deep link go to the parent page. */
export function useSheetClose(parent: string) {
  const nav = useNavigate();
  const { key } = useLocation();
  return () => (key !== 'default' ? nav(-1) : nav(parent, { replace: true }));
}

/**
 * A bottom sheet that is a ROUTE (e.g. /app/book/confirm): the browser back button, the iOS swipe and
 * Android predictive back close the sheet instead of leaving the app. Vaul gives swipe-to-dismiss and focus trap.
 */
export function RouteSheet({ title, parent = '..', children, dismissible = true, className = '', footer, onClose }: {
  title: string; parent?: string; children: ReactNode; dismissible?: boolean; className?: string; footer?: ReactNode; onClose?: () => void;
}) {
  const goBack = useSheetClose(parent);
  const [open, setOpen] = useState(true);
  const close = () => { if (dismissible) { setOpen(false); window.setTimeout(onClose ?? goBack, 180); } };
  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o && dismissible) close(); }} dismissible={dismissible}>
      <Drawer.Portal>
        <Drawer.Overlay className="v-overlay" />
        <Drawer.Content className={`v-sheet ${className}`} aria-describedby={undefined}>
          <div className="grab" aria-hidden />
          <div className="s-head">
            <Drawer.Title className="h2">{title}</Drawer.Title>
            <button className="iconbtn" aria-label="關閉" disabled={!dismissible} onClick={close} style={{ boxShadow: 'none' }}><Icon name="x" /></button>
          </div>
          <div className="s-body">{children}</div>
          {footer && <div className="s-footer">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
