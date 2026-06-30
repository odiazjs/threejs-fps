import type { LeaderboardResponse } from '../../shared/api/leaderboard';
import { API_BASE_URL } from '../config/apiUrl';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

export async function apiGetLeaderboard(): Promise<LeaderboardResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/leaderboard`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const data = (await response.json().catch(() => ({}))) as LeaderboardResponse & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }

  return data;
}
