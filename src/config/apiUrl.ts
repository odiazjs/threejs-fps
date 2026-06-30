import { SERVER_URL } from './serverUrl';

/** Same-origin in dev (Vite proxies /api). Full server URL in production. */
export const API_BASE_URL = import.meta.env.DEV ? '' : SERVER_URL;
