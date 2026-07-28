import type {
  MatchPerformanceStats,
  MatchRewardBreakdown,
} from '../content/matchRewards.js';
import type { AccountProgressSnapshot, RankProgressSnapshot } from './rank.js';

/** Client → server payload after a TDM match ends. */
export interface SubmitMatchResultRequest {
  readonly matchId: string;
  readonly roomId: string;
  readonly mapId: string;
  readonly mode?: string;
  readonly teamId: number;
  readonly winningTeamId: number;
  readonly matchStartAt?: number;
  readonly matchDurationSec?: number;
  readonly performance: MatchPerformanceStats;
  /** Optional claim; server may ignore / recompute later. */
  readonly wasMvp?: boolean;
}

export interface SubmitMatchResultResponse {
  readonly matchId: string;
  /** True when this request first applied awards (false on idempotent replay). */
  readonly newlyAwarded: boolean;
  readonly won: boolean;
  readonly tied: boolean;
  readonly wasMvp: boolean;
  readonly performance: MatchPerformanceStats;
  readonly rewards: MatchRewardBreakdown;
  readonly account: AccountProgressSnapshot;
  readonly rank: RankProgressSnapshot;
  readonly seasonXpTotal: number;
  readonly seasonLevel: number;
  /** Player plasma mineral balance after this award (or current on replay). */
  readonly plasmaMinerals: number;
}
