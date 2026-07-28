import type { RankDefinition, RankDivision, RankTierId } from '../content/ranks.js';

export interface RankProgressSnapshot {
  readonly id: string;
  readonly tier: RankTierId;
  readonly division: RankDivision;
  readonly name: string;
  readonly minRp: number;
  readonly rp: number;
  readonly next: RankDefinition | null;
  readonly rpToNext: number;
  readonly progress01: number;
}

export interface AccountProgressSnapshot {
  readonly level: number;
  readonly totalXp: number;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
}

export interface CareerStatsSnapshot {
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly winRate: number;
  readonly kills: number;
  readonly deaths: number;
  readonly kd: number;
}

export interface SeasonInfoSnapshot {
  readonly id: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
  /** Milliseconds until season end (0 if ended). */
  readonly endsInMs: number;
}

export interface SeasonStatsSnapshot {
  readonly rp: number;
  readonly peakRp: number;
  readonly totalRpEarned: number;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly currentWinStreak: number;
  readonly longestWinStreak: number;
  readonly mvpAwards: number;
  readonly seasonLevel: number;
  readonly seasonXp: number;
  readonly seasonXpIntoLevel: number;
  readonly seasonXpForNextLevel: number;
  readonly highestRankName: string;
}

export interface SeasonRewardSnapshot {
  readonly level: number;
  readonly rewardType: string;
  readonly rewardLabel: string;
  readonly rewardAmount: number | null;
  readonly rewardItemId: string | null;
  /** Public image path for ranked track preview (null = text-only). */
  readonly previewImageUrl: string | null;
  readonly unlocked: boolean;
  readonly claimed: boolean;
}

export interface ClaimSeasonRewardResponse {
  readonly claimed: SeasonRewardSnapshot;
  readonly plasmaMinerals: number;
  readonly progression: RankProgressionResponse;
}

export interface RankedMatchHistoryEntry {
  readonly matchId: string;
  readonly mapId: string;
  readonly won: boolean;
  readonly tied: boolean;
  readonly rpDelta: number;
  readonly xpGained: number;
  readonly seasonXpGained: number;
  readonly mineralsGained: number;
  readonly kills: number;
  readonly deaths: number;
  readonly endedAt: string;
}

export interface RankLadderResponse {
  readonly ranks: readonly RankDefinition[];
}

/** Full payload for the Rank Progression screen. */
export interface RankProgressionResponse {
  readonly displayName: string;
  readonly account: AccountProgressSnapshot;
  readonly career: CareerStatsSnapshot;
  readonly season: SeasonInfoSnapshot;
  readonly seasonStats: SeasonStatsSnapshot;
  readonly rank: RankProgressSnapshot;
  /** Full ladder for the tiers panel. */
  readonly rankLadder: readonly RankDefinition[];
  readonly seasonRewards: readonly SeasonRewardSnapshot[];
  readonly recentMatches: readonly RankedMatchHistoryEntry[];
}
