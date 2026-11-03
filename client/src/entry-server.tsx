// Build-time pre-render of the public landing page (#7). Used only by scripts/prerender.mjs.
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Landing } from './pages/Landing';

export function render(): string {
  const router = createMemoryRouter([{ path: '/', Component: Landing }], { initialEntries: ['/'] });
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
