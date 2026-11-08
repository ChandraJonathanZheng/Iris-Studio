// Thin fetch wrapper. The auth cookie is HttpOnly and same-origin, so we never touch tokens here.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Options {
  /** #19: same key on every retry of one user action → the server runs it once */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function request<T>(method: string, url: string, body?: unknown, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', signal: opts.signal });
  } catch {
    throw new ApiError(0, 'network', '連線失敗，請檢查網路後再試一次。');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    // Server returns RFC 7807 problem details: { title, detail, code }
    throw new ApiError(res.status, data?.code ?? 'error', data?.detail ?? data?.title ?? '發生錯誤，請稍後再試。');
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>('GET', url, undefined, { signal }),
  post: <T>(url: string, body?: unknown, opts?: Options) => request<T>('POST', url, body, opts),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
