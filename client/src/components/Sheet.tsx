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
 * dismissible=false while a request is running, so the sheet can't be swiped away mid-save.
 */
export function RouteSheet({ title, parent = '..', children, dismissible = true, footer, onClose }: {
  title: string; parent?: string; children: ReactNode; dismissible?: boolean; footer?: ReactNode; onClose?: () => void;
}) {
  const goBack = useSheetClose(parent);
  const [open, setOpen] = useState(true);
  const close = () => { setOpen(false); window.setTimeout(onClose ?? goBack, 180); };
  return (
    <Drawer.Root open={open} dismissible={dismissible} onOpenChange={(o) => { if (!o) close(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className="sheet" aria-describedby={undefined}>
          <div className="grab" aria-hidden="true" />
          <div className="row between">
            <Drawer.Title className="h2">{title}</Drawer.Title>
            <button className="icon-btn" aria-label="關閉" disabled={!dismissible} onClick={close}><Icon name="x" /></button>
          </div>
          {children}
          {footer}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
