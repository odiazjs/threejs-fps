import type { MeResponse } from '../../shared/api/me';
import { apiGetMe } from '../auth/meApi';
import { ensureSession, type PlayerProfile } from '../auth/playerSession';
const ME_CACHE_KEY = 'fps_me_profile';

export async function initAppSession(): Promise<PlayerProfile> {
  return ensureSession();
}

export async function getAppProfile(forceRefresh = false): Promise<MeResponse> {
  if (!forceRefresh) {
    const cached = sessionStorage.getItem(ME_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as MeResponse;
      } catch {
        sessionStorage.removeItem(ME_CACHE_KEY);
      }
    }
  }

  const profile = await apiGetMe();
  sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify(profile));
  return profile;
}

export function clearAppProfileCache(): void {
  sessionStorage.removeItem(ME_CACHE_KEY);
}
