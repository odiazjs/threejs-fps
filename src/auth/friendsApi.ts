import type {
  FriendRequestResponse,
  FriendRespondResponse,
  FriendsListResponse,
} from '../../shared/api/friends';
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

export async function apiListFriends(): Promise<FriendsListResponse> {
  return authFetch<FriendsListResponse>('/api/friends');
}

export async function apiSendFriendRequest(email: string): Promise<FriendRequestResponse> {
  return authFetch<FriendRequestResponse>('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function apiRespondFriendRequest(
  requestId: string,
  accepted: boolean,
): Promise<FriendRespondResponse> {
  return authFetch<FriendRespondResponse>('/api/friends/respond', {
    method: 'POST',
    body: JSON.stringify({ requestId, accepted }),
  });
}

export async function apiRemoveFriend(friendUserId: string): Promise<void> {
  await authFetch<{ success: boolean }>(`/api/friends/${encodeURIComponent(friendUserId)}`, {
    method: 'DELETE',
  });
}
