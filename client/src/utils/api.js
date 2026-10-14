import { browserTimeZone } from './dailyProgress.js';

const BASE = '/api'; // Vite proxy handles /api → backend

// Gateway timeouts come back from nginx/Cloudflare as HTML, not our JSON
const TIMEOUT_STATUSES = [502, 504, 524];
const TIMEOUT_MESSAGE =
  'This is taking longer than usual (often while chapter summaries are being prepared). Try again in a moment — finished summaries are kept.';

function errorMessage(res, err) {
  if (err.error) return err.error;
  if (TIMEOUT_STATUSES.includes(res.status)) return TIMEOUT_MESSAGE;
  return `HTTP ${res.status}`;
}

function apiError(res, err) {
  const error = new Error(errorMessage(res, err));
  error.status = res.status;
  error.code = err.code;
  return error;
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-Timezone': browserTimeZone() },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw apiError(res, err);
  }
  // Handle binary responses (export)
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.blob();
}

// POST that returns a file: resolves to { blob, filename } using the
// server's Content-Disposition filename when present
async function download(path, body, fallbackName) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw apiError(res, err);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = disposition.match(/filename="([^"]+)"/i);
  const filename = encoded ? decodeURIComponent(encoded[1]) : plain ? plain[1] : fallbackName;
  return { blob: await res.blob(), filename };
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
  download,
};
