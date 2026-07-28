import type {
  ClaimSeasonRewardResponse,
  RankLadderResponse,
  RankProgressionResponse,
} from '../../shared/api/rank';
import type {
  SubmitMatchResultRequest,
  SubmitMatchResultResponse,
} from '../../shared/api/matchRewards';
import { API_BASE_URL } from '../config/apiUrl';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

export async function apiGetRankProgression(): Promise<RankProgressionResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/me/rank`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const data = (await response.json().catch(() => ({}))) as RankProgressionResponse & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Could not load rank progression');
  }
  return data;
}

export async function apiGetRankLadder(): Promise<RankLadderResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/ranks`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const data = (await response.json().catch(() => ({}))) as RankLadderResponse & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Could not load ranks');
  }
  return data;
}

export async function apiClaimSeasonReward(
  level: number,
): Promise<ClaimSeasonRewardResponse> {
  const session = await ensureSession();
  const response = await fetch(
    `${API_BASE_URL}/api/me/rank/season-rewards/${encodeURIComponent(String(level))}/claim`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    },
  );

  const data = (await response.json().catch(() => ({}))) as ClaimSeasonRewardResponse &
    ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Could not claim season reward');
  }
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  return data;
}

/** Upload in-match performance; server computes + persists XP/RP awards. */
export async function apiSubmitMatchResult(
  body: SubmitMatchResultRequest,
): Promise<SubmitMatchResultResponse> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}/api/me/rank/match-result`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as SubmitMatchResultResponse &
    ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Could not submit match result');
  }
  return data;
}
