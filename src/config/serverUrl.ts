const DEFAULT_SERVER_URL = 'http://localhost:4001';

declare global {
  interface Window {
    __COLYSEUS_URL__?: string;
  }
}

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

function readViteEnvUrl(): string {
  const raw = import.meta.env.VITE_COLYSEUS_URL;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';
  return trimmed;
}

/** Derive server host from Render static site hostname (client → server service pair). */
function readOnRenderDerivedUrl(): string {
  if (typeof window === 'undefined') return '';

  const { hostname, protocol } = window.location;
  if (!hostname.endsWith('.onrender.com')) return '';

  const serverHost = hostname.replace(/-client\b/i, '-server');
  if (serverHost === hostname) return '';

  return `${protocol}//${serverHost}`;
}

function readRuntimeUrl(): string {
  if (typeof window === 'undefined') return '';

  const fromWindow = window.__COLYSEUS_URL__?.trim();
  if (fromWindow) return fromWindow;

  const meta = document
    .querySelector('meta[name="colyseus-url"]')
    ?.getAttribute('content')
    ?.trim();
  if (meta) return meta;

  return readOnRenderDerivedUrl();
}

/** Colyseus + REST API base URL (lazy — safe to call after DOM is ready). */
export function getServerUrl(): string {
  const resolved =
    readViteEnvUrl() ||
    readRuntimeUrl() ||
    DEFAULT_SERVER_URL;

  return normalizeServerUrl(resolved);
}

/** @deprecated Prefer getServerUrl() — kept for existing imports. */
export const SERVER_URL = getServerUrl();
