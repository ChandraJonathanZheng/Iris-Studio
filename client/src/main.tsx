import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { routes } from './App';
import { ToastProvider } from './components/Toast';
import { makeQueryClient } from './lib/queries';
import './styles.css';

async function start() {
  if (import.meta.env.MODE === 'mock') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  }
  const qc = makeQueryClient();
  const router = createBrowserRouter(routes);
  const root = document.getElementById('root')!;
  // The landing page HTML was pre-rendered at build time (#7). We render fresh on top of it rather than hydrate,
  // because the server snapshot has no router/query state; the visitor already saw the content instantly.
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void start();
