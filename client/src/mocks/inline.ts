import { getResponse } from 'msw';
import { handlers } from './handlers';

/**
 * Prototype build: hosted pages can't register a service worker, so instead of MSW's worker we wrap
 * window.fetch and answer /api/* with the same handlers, directly in the page.
 */
export function installInlineMock() {
  const realFetch = window.fetch.bind(window);
  // The demo never talks to a network. Relative paths are resolved against a fixed fake address, NOT the page's
  // own address: opened from disk on Windows the page is file:///C:/…/demo.html, so '/api/me' would become
  // file:///C:/api/me (pathname '/C:/api/me'), miss the check below and go out as a real request.
  // Inside a preview frame the address is about:srcdoc, where new URL() throws. A fixed base avoids both.
  const base = 'http://iris-studio.demo/';
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url, base);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init); // fonts, images: not ours
    const req = new Request(url, init);
    // baseUrl: MSW resolves handler paths like '/api/me' against the page address too, so give it the same base
    const res = await getResponse(handlers, req, { baseUrl: base });
    return res ?? new Response(JSON.stringify({ detail: '找不到這個 API。' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
}
