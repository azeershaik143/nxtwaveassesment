const viteApi = (import.meta.env.VITE_API_URL || '').trim();

/**
 * During `vite dev`, prefer same-origin `/api` so the dev proxy talks to the backend.
 * Set `VITE_API_URL` only if you intentionally bypass the proxy (then fix CORS on the server).
 */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (import.meta.env.DEV && !viteApi) {
    return `/api${p}`;
  }
  const base = (viteApi || 'http://127.0.0.1:4000').replace(/\/$/, '');
  return `${base}${p}`;
}

export async function apiFetch(path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(apiUrl(path), { ...options, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const msg = data?.error || res.statusText || 'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}
