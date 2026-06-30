import type { MeResponse } from '../../shared/api/me';
import { API_BASE_URL } from '../config/apiUrl';
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
