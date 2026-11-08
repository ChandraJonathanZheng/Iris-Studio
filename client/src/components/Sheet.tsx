import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Drawer } from 'vaul';
import { Icon } from './Icon';

/**
 * A bottom sheet that is a ROUTE (e.g. /app/book/confirm).
 * #12: because it has its own history entry, the browser back button, the iOS swipe and Android's
 *      predictive back close the sheet instead of leaving the app.
 * #10 / #11: Vaul gives swipe-to-dismiss with velocity, and its drag can interrupt the open/close animation.
 */
export function RouteSheet({ title, children, dismissible = true, onClose }: {
  title: string; children: ReactNode; dismissible?: boolean; onClose?: () => void;
}) {
  const nav = useNavigate();
  const [open, setOpen] = useState(true);
  const close = () => { if (onClose) onClose(); else nav(-1); };
  return (
    <Drawer.Root
      open={open}
      dismissible={dismissible}
      onOpenChange={(o) => { if (!o) { setOpen(false); window.setTimeout(close, 180); } }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className="sheet" aria-describedby={undefined}>
          <div className="grab" aria-hidden="true" />
          <div className="row between">
            <Drawer.Title className="h2">{title}</Drawer.Title>
            <button className="icon-btn" aria-label="關閉" disabled={!dismissible} onClick={() => setOpen(false)}><Icon name="x" /></button>
          </div>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
