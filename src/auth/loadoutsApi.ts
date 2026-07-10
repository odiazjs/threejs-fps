import type {
  CreateWeaponLoadoutRequest,
  UpdateWeaponLoadoutRequest,
  WeaponLoadoutMutationResponse,
  WeaponLoadoutsListResponse,
} from '../../shared/api/loadouts';
import { API_BASE_URL } from '../config/apiUrl';
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

export async function apiListLoadouts(): Promise<WeaponLoadoutsListResponse> {
  return authFetch<WeaponLoadoutsListResponse>('/api/me/loadouts');
}

export async function apiCreateLoadout(
  body: CreateWeaponLoadoutRequest,
): Promise<WeaponLoadoutMutationResponse> {
  return authFetch<WeaponLoadoutMutationResponse>('/api/me/loadouts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiUpdateLoadout(
  loadoutId: string,
  body: UpdateWeaponLoadoutRequest,
): Promise<WeaponLoadoutMutationResponse> {
  return authFetch<WeaponLoadoutMutationResponse>(
    `/api/me/loadouts/${encodeURIComponent(loadoutId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export async function apiSetDefaultLoadout(
  loadoutId: string,
): Promise<WeaponLoadoutMutationResponse> {
  return authFetch<WeaponLoadoutMutationResponse>(
    `/api/me/loadouts/${encodeURIComponent(loadoutId)}/default`,
    { method: 'POST' },
  );
}

export async function apiDeleteLoadout(loadoutId: string): Promise<void> {
  await authFetch<{ success: true }>(`/api/me/loadouts/${encodeURIComponent(loadoutId)}`, {
    method: 'DELETE',
  });
}
