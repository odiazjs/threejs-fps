const DEFAULT_SERVER_URL = 'http://localhost:4001';

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

export const SERVER_URL = normalizeServerUrl(
  import.meta.env.VITE_COLYSEUS_URL ?? DEFAULT_SERVER_URL,
);
