import type { MeResponse } from '../../shared/api/me';
import { apiGetMe } from '../auth/meApi';
import { ensureSession, type PlayerProfile } from '../auth/playerSession';

export async function initAppSession(): Promise<PlayerProfile> {
  return ensureSession();
}

/** Always fetches live stats from /api/me (no client cache). */
export async function getAppProfile(): Promise<MeResponse> {
  return apiGetMe();
}
