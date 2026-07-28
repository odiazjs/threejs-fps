import type { MapId } from '../level/maps.js';

export type GameMode = 'playground' | 'tdm' | 'tdm_kills';

export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'ended';

export type MatchWinCondition = 'none' | 'time' | 'kills';

export const DEFAULT_GAME_MODE: GameMode = 'playground';

export const GAME_MODE_OPTIONS = [
  {
    id: 'playground' as const,
    label: 'Testing Playground',
    description: 'Free play — no timer or scores',
    winCondition: 'none' as const,
  },
  {
    id: 'tdm' as const,
    label: 'Team Deathmatch',
    description: 'Timed team match — most kills when the clock hits zero',
    winCondition: 'time' as const,
  },
  {
    id: 'tdm_kills' as const,
    label: 'First to Kills',
    description: 'Team race — first side to hit the kill target wins',
    winCondition: 'kills' as const,
  },
] as const;

/** Timed TDM length choices (seconds). */
export const TDM_DURATION_OPTIONS_SEC = [120, 180, 300] as const;
export type TdmDurationSec = (typeof TDM_DURATION_OPTIONS_SEC)[number];
export const DEFAULT_TDM_DURATION_SEC: TdmDurationSec = 180;

/** First-to-kills target choices. */
export const KILL_RACE_TARGET_OPTIONS = [10, 15, 20] as const;
export type KillRaceTarget = (typeof KILL_RACE_TARGET_OPTIONS)[number];
export const DEFAULT_KILL_RACE_TARGET: KillRaceTarget = 15;

export const TDM_COUNTDOWN_SEC = 10;
/** Minimum time the pre-match roster screen stays up before countdown. */
export const PRE_MATCH_MIN_SEC = 10;
/** @deprecated Prefer DEFAULT_TDM_DURATION_SEC / selected duration. */
export const TDM_MATCH_DURATION_SEC = DEFAULT_TDM_DURATION_SEC;
export const TDM_KILL_POINTS = 50;
export const MAX_TDM_TEAMS = 4;

export function isValidGameMode(value: string | null | undefined): value is GameMode {
  return value === 'playground' || value === 'tdm' || value === 'tdm_kills';
}

export function normalizeGameMode(value: string | null | undefined): GameMode {
  if (value === 'tdm' || value === 'tdm_kills') return value;
  return 'playground';
}

/** Modes that use match phases, teams, scores, and results. */
export function isCompetitiveGameMode(mode: GameMode | string | null | undefined): boolean {
  return mode === 'tdm' || mode === 'tdm_kills';
}

export function isTimedGameMode(mode: GameMode | string | null | undefined): boolean {
  return mode === 'tdm';
}

export function isKillRaceGameMode(mode: GameMode | string | null | undefined): boolean {
  return mode === 'tdm_kills';
}

export function getGameModeWinCondition(
  mode: GameMode | string | null | undefined,
): MatchWinCondition {
  if (mode === 'tdm') return 'time';
  if (mode === 'tdm_kills') return 'kills';
  return 'none';
}

export function isValidTdmDurationSec(value: number | null | undefined): value is TdmDurationSec {
  return (
    typeof value === 'number' &&
    (TDM_DURATION_OPTIONS_SEC as readonly number[]).includes(value)
  );
}

export function normalizeTdmDurationSec(value: number | null | undefined): TdmDurationSec {
  return isValidTdmDurationSec(value) ? value : DEFAULT_TDM_DURATION_SEC;
}

export function isValidKillRaceTarget(value: number | null | undefined): value is KillRaceTarget {
  return (
    typeof value === 'number' &&
    (KILL_RACE_TARGET_OPTIONS as readonly number[]).includes(value)
  );
}

export function normalizeKillRaceTarget(value: number | null | undefined): KillRaceTarget {
  return isValidKillRaceTarget(value) ? value : DEFAULT_KILL_RACE_TARGET;
}

/** Resolve create-room duration / kill-limit from mode + lobby picks. */
export function resolveMatchRules(
  mode: GameMode,
  durationSec?: number | null,
  killTarget?: number | null,
): { matchDurationSec: number; killLimit: number } {
  if (mode === 'tdm') {
    return {
      matchDurationSec: normalizeTdmDurationSec(durationSec),
      killLimit: 0,
    };
  }
  if (mode === 'tdm_kills') {
    return {
      matchDurationSec: 0,
      killLimit: normalizeKillRaceTarget(killTarget),
    };
  }
  return { matchDurationSec: 0, killLimit: 0 };
}

/** Big-text objective shown during the pre-match countdown. */
export function getMatchObjectiveBanner(
  mode: GameMode | string | null | undefined,
  matchDurationSec: number,
  killLimit: number,
): string {
  if (mode === 'tdm_kills') {
    const target = killLimit > 0 ? killLimit : DEFAULT_KILL_RACE_TARGET;
    return `First to ${target} kills wins!`;
  }
  if (mode === 'tdm') {
    const duration = matchDurationSec > 0 ? matchDurationSec : DEFAULT_TDM_DURATION_SEC;
    const mins = Math.max(1, Math.round(duration / 60));
    return `Get as many kills as possible in ${mins} min${mins === 1 ? '' : 's'}!`;
  }
  return '';
}

export function formatDurationOptionLabel(durationSec: number): string {
  const mins = Math.max(1, Math.round(durationSec / 60));
  return `${mins} MIN`;
}

export function formatKillTargetOptionLabel(kills: number): string {
  return `${kills} KILLS`;
}

/** Humans required before a competitive match leaves the lobby. */
export function defaultTdmExpectedPlayers(mapId: MapId): number {
  return mapId === 'killhouse_small' ? 4 : 2;
}

/** Team layout for competitive modes based on how many humans are in the match. */
export function resolveTdmTeamCount(playerCount: number): number {
  if (playerCount <= 1) return 1;
  if (playerCount === 2) return 2;
  if (playerCount === 3) return 3;
  return 2;
}

export function formatMatchTimer(secondsRemaining: number): string {
  const total = Math.max(0, Math.ceil(secondsRemaining));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function normalizeMatchPhase(value: string | null | undefined): MatchPhase {
  if (value === 'countdown' || value === 'playing' || value === 'ended') {
    return value;
  }
  return 'waiting';
}

export function getCountdownDisplayValue(
  worldTime: number,
  countdownEndAt: number,
): string | null {
  const remaining = countdownEndAt - worldTime;
  if (remaining <= 0) return 'GO!';
  const whole = Math.ceil(remaining);
  if (whole > TDM_COUNTDOWN_SEC) return null;
  return String(whole);
}

/** Server-synced match clock — counts down during the playing phase. */
export function getMatchTimeRemaining(
  phase: MatchPhase,
  worldTime: number,
  matchStartAt: number,
  matchEndAt: number,
  matchDurationSec: number,
): number {
  const duration = matchDurationSec > 0 ? matchDurationSec : DEFAULT_TDM_DURATION_SEC;
  if (phase !== 'playing') {
    return duration;
  }
  if (matchEndAt > 0) {
    return Math.max(0, matchEndAt - worldTime);
  }
  if (matchStartAt > 0 && matchDurationSec > 0) {
    return Math.max(0, matchStartAt + duration - worldTime);
  }
  return duration;
}

export function teamScoreToKills(score: number): number {
  if (score <= 0) return 0;
  return Math.floor(score / TDM_KILL_POINTS);
}
