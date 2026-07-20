import type {
  EquipWeaponSightResponse,
  PurchaseWeaponUnlockableResponse,
  SellWeaponUnlockableResponse,
  WeaponUnlockablesListResponse,
} from '../../shared/api/weaponUnlockables';
import { API_BASE_URL } from '../config/apiUrl';
import { hydrateEquippedWeaponSights } from '../content/equippedWeaponSights';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
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

function applyEquippedSights(data: { equippedSights?: Record<string, string> }): void {
  if (data.equippedSights) {
    hydrateEquippedWeaponSights(data.equippedSights);
  }
}

export async function apiListWeaponUnlockables(): Promise<WeaponUnlockablesListResponse> {
  const data = await authJson<WeaponUnlockablesListResponse>('/api/me/weapon-unlockables');
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  applyEquippedSights(data);
  return data;
}

export async function apiPurchaseWeaponUnlockable(
  unlockableId: string,
): Promise<PurchaseWeaponUnlockableResponse> {
  const data = await authJson<PurchaseWeaponUnlockableResponse>(
    `/api/me/weapon-unlockables/${encodeURIComponent(unlockableId)}/purchase`,
    { method: 'POST' },
  );
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  applyEquippedSights(data);
  return data;
}

export async function apiSellWeaponUnlockable(
  unlockableId: string,
): Promise<SellWeaponUnlockableResponse> {
  const data = await authJson<SellWeaponUnlockableResponse>(
    `/api/me/weapon-unlockables/${encodeURIComponent(unlockableId)}/sell`,
    { method: 'POST' },
  );
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  applyEquippedSights(data);
  return data;
}

export async function apiEquipWeaponSight(
  weaponId: string,
  sightId: string | null,
): Promise<EquipWeaponSightResponse> {
  const data = await authJson<EquipWeaponSightResponse>('/api/me/weapon-sights', {
    method: 'PUT',
    body: JSON.stringify({ weaponId, sightId }),
  });
  applyEquippedSights(data);
  return data;
}
