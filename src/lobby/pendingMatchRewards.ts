import type { SubmitMatchResultResponse } from '../../shared/api/matchRewards';
import type { MatchPerformanceStats, MatchRewardBreakdown } from '../../shared/content/matchRewards';
import type { AccountProgressSnapshot, RankProgressSnapshot } from '../../shared/api/rank';

const PENDING_KEY = 'fps.pendingMatchXp.v1';
const SEEN_KEY = 'fps.seenMatchXpIds.v1';
const MAX_SEEN = 40;

/** Full post-match award payload kept until the lobby modal is dismissed. */
export interface PendingMatchXpPayload {
  readonly matchId: string;
  readonly won: boolean;
  readonly tied: boolean;
  readonly wasMvp: boolean;
  readonly performance: MatchPerformanceStats;
  readonly rewards: MatchRewardBreakdown;
  readonly account: AccountProgressSnapshot | null;
  readonly rank: RankProgressSnapshot | null;
  readonly seasonXpTotal: number | null;
  readonly seasonLevel: number | null;
  /** True when only history summary is available (no line-item breakdown). */
  readonly summaryOnly: boolean;
  readonly savedAt: number;
  /** Balance after award, when known from match-result API. */
  readonly plasmaMinerals: number | null;
}

function readSeenIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeSeenIds(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, MAX_SEEN)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasSeenMatchXp(matchId: string): boolean {
  return readSeenIds().includes(matchId);
}

export function markMatchXpSeen(matchId: string): void {
  const ids = readSeenIds().filter((id) => id !== matchId);
  ids.unshift(matchId);
  writeSeenIds(ids);
}

/** Persist awards as soon as the match-result API returns (before leave). */
export function savePendingMatchXp(result: SubmitMatchResultResponse): void {
  if (hasSeenMatchXp(result.matchId)) return;
  const payload: PendingMatchXpPayload = {
    matchId: result.matchId,
    won: result.won,
    tied: result.tied,
    wasMvp: result.wasMvp,
    performance: result.performance,
    rewards: result.rewards,
    account: result.account,
    rank: result.rank,
    seasonXpTotal: result.seasonXpTotal,
    seasonLevel: result.seasonLevel,
    summaryOnly: false,
    savedAt: Date.now(),
    plasmaMinerals: result.plasmaMinerals,
  };
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekPendingMatchXp(): PendingMatchXpPayload | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMatchXpPayload;
    if (!parsed?.matchId || !parsed.rewards) return null;
    if (hasSeenMatchXp(parsed.matchId)) {
      clearPendingMatchXp();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingMatchXp(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Read + clear pending payload (caller should mark seen after modal dismiss). */
export function consumePendingMatchXp(): PendingMatchXpPayload | null {
  const pending = peekPendingMatchXp();
  if (pending) clearPendingMatchXp();
  return pending;
}

export function savePendingMatchXpSummary(input: {
  matchId: string;
  won: boolean;
  tied: boolean;
  kills: number;
  deaths: number;
  xpGained: number;
  seasonXpGained: number;
  rpDelta: number;
  mineralsGained?: number;
}): void {
  if (hasSeenMatchXp(input.matchId)) return;
  const payload: PendingMatchXpPayload = {
    matchId: input.matchId,
    won: input.won,
    tied: input.tied,
    wasMvp: false,
    performance: {
      kills: input.kills,
      deaths: input.deaths,
      damageDealt: 0,
      damageTaken: 0,
      headshotDamage: 0,
      shotsFired: 0,
      shotsHit: 0,
    },
    rewards: {
      baseXp: 0,
      killXp: 0,
      deathXp: 0,
      damageXp: 0,
      headshotXp: 0,
      accuracyXp: 0,
      kdXp: 0,
      outcomeXp: 0,
      mvpXp: 0,
      totalXp: input.xpGained,
      seasonXp: input.seasonXpGained,
      rpDelta: input.rpDelta,
      accuracy01: 0,
      mineralsGained: input.mineralsGained ?? 0,
    },
    account: null,
    rank: null,
    seasonXpTotal: null,
    seasonLevel: null,
    summaryOnly: true,
    savedAt: Date.now(),
    plasmaMinerals: null,
  };
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
