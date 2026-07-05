import { getServerUrl } from './serverUrl';

/** Same-origin in dev (Vite proxies /api). Full server URL in production. */
export function getApiBaseUrl(): string {
  return import.meta.env.DEV ? '' : getServerUrl();
}

/** @deprecated Prefer getApiBaseUrl() */
export const API_BASE_URL = getApiBaseUrl();
