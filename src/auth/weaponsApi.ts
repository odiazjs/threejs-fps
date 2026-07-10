import type {
  BatchUpgradeWeaponResponse,
  PlayerWeaponsListResponse,
  UpgradeWeaponStatResponse,
  WeaponUpgradeLevelDeltas,
  WeaponsListResponse,
} from '../../shared/api/weapons';
import type { WeaponUpgradeStatId } from '../../shared/content/weaponUpgrades';
import { API_BASE_URL } from '../config/apiUrl';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }

  return data;
}

export async function apiListWeapons(options?: {
  loadoutEligible?: boolean;
}): Promise<WeaponsListResponse> {
  const params = new URLSearchParams();
  if (options?.loadoutEligible) params.set('loadoutEligible', 'true');
  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/api/weapons${query ? `?${query}` : ''}`);
  const data = (await response.json().catch(() => ({}))) as WeaponsListResponse & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }
  return data;
}

export async function apiListMyWeapons(): Promise<PlayerWeaponsListResponse> {
  const result = await authFetch<PlayerWeaponsListResponse>('/api/me/weapons');
  setPlasmaMineralsDisplay(result.plasmaMinerals);
  return result;
}

export async function apiUpgradeWeaponStat(
  weaponId: string,
  stat: WeaponUpgradeStatId,
  delta: 1 | -1 = 1,
): Promise<UpgradeWeaponStatResponse> {
  const result = await authFetch<UpgradeWeaponStatResponse>(
    `/api/me/weapons/${encodeURIComponent(weaponId)}/upgrade`,
    {
      method: 'POST',
      body: JSON.stringify({ stat, delta }),
    },
  );
  setPlasmaMineralsDisplay(result.plasmaMinerals);
  return result;
}

/** Save all pending Armory level deltas in a single request. */
export async function apiBatchUpgradeWeaponStats(
  weaponId: string,
  deltas: WeaponUpgradeLevelDeltas,
): Promise<BatchUpgradeWeaponResponse> {
  const result = await authFetch<BatchUpgradeWeaponResponse>(
    `/api/me/weapons/${encodeURIComponent(weaponId)}/upgrades`,
    {
      method: 'POST',
      body: JSON.stringify({ deltas }),
    },
  );
  setPlasmaMineralsDisplay(result.plasmaMinerals);
  return result;
}
