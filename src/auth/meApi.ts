import type {
  MeResponse,
  PurchasePlasmaMineralsResponse,
} from '../../shared/api/me';
import type { PlasmaMineralPackId } from '../../shared/content/plasmaMineralPacks';
import { API_BASE_URL } from '../config/apiUrl';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

export async function apiGetMe(): Promise<MeResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/me`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const data = (await response.json().catch(() => ({}))) as MeResponse & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }

  return data;
}

export async function apiPurchasePlasmaMinerals(
  packId: PlasmaMineralPackId,
): Promise<PurchasePlasmaMineralsResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/me/plasma-minerals/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ packId }),
  });

  const data = (await response.json().catch(() => ({}))) as PurchasePlasmaMineralsResponse &
    ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Purchase failed');
  }

  setPlasmaMineralsDisplay(data.plasmaMinerals);
  return data;
}
