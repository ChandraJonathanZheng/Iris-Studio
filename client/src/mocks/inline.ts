import { getResponse } from 'msw';
import { handlers } from './handlers';

/**
 * Prototype build: hosted pages can't register a service worker, so instead of MSW's worker we wrap
 * window.fetch and answer /api/* with the same handlers, directly in the page.
 */
export function installInlineMock() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const req = new Request(url, init);
    const res = await getResponse(handlers, req);
    return res ?? new Response(JSON.stringify({ detail: '找不到這個 API。' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
}
