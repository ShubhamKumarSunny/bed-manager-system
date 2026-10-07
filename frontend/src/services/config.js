// Runtime configuration derived from Vite env variables.
//
// By default the app talks to an API on its own origin (`/api`): in development
// Vite proxies it to the local backend, and on Vercel the API is deployed as a
// serverless function next to the static frontend.

const trimSlash = (value) => (value || '').replace(/\/+$/, '');

export const API_BASE_URL = trimSlash(import.meta.env.VITE_API_BASE_URL) || '/api';

// Origin of the API server, used for files it serves (e.g. profile pictures).
// Empty string means "same origin".
export const API_ORIGIN = /^https?:\/\//.test(API_BASE_URL) ? new URL(API_BASE_URL).origin : '';

// Socket.IO needs a long-running server. It is always available in development;
// in production it is only used when VITE_SOCKET_URL points at such a server.
// Otherwise the app keeps itself fresh by polling.
export const SOCKET_URL =
  trimSlash(import.meta.env.VITE_SOCKET_URL) || (import.meta.env.DEV ? window.location.origin : null);

export const REALTIME_ENABLED = Boolean(SOCKET_URL);

/** Resolve a server-relative file path (e.g. `/api/profile/picture/...`) to a full URL */
export const assetUrl = (path) => {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_ORIGIN}${path}`;
};
