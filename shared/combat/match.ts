import type { MapId } from '../level/maps.js';
import { MAP_OPTIONS, normalizeMapId } from '../level/maps.js';

export type GameMode = 'playground' | 'tdm' | 'tdm_kills' | 'plasma_harvest';

export type MatchPhase =
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'round_end'
  | 'ended';

export type MatchWinCondition = 'none' | 'time' | 'kills' | 'install';

export const DEFAULT_GAME_MODE: GameMode = 'playground';

/** Plasma Harvest always runs on the Harvest arena. */
export const PLASMA_HARVEST_MAP_ID = 'harvest' as const satisfies MapId;

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
  {
    id: 'plasma_harvest' as const,
    label: 'Plasma Harvest',
    description: 'Steal the enemy harvesting box and install it at your base',
    winCondition: 'install' as const,
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

/** Plasma Harvest series: first to N round wins (best-of 2N-1). */
export const HARVEST_ROUNDS_TO_WIN_OPTIONS = [3, 4] as const;
export type HarvestRoundsToWin = (typeof HARVEST_ROUNDS_TO_WIN_OPTIONS)[number];
export const DEFAULT_HARVEST_ROUNDS_TO_WIN: HarvestRoundsToWin = 3;
/** Showcase / ROUND WON hold before next countdown or match results. */
export const HARVEST_ROUND_END_SEC = 5;

export const TDM_COUNTDOWN_SEC = 10;
/** Minimum time the pre-match roster screen stays up before countdown. */
export const PRE_MATCH_MIN_SEC = 10;
/** @deprecated Prefer DEFAULT_TDM_DURATION_SEC / selected duration. */
export const TDM_MATCH_DURATION_SEC = DEFAULT_TDM_DURATION_SEC;
export const TDM_KILL_POINTS = 50;
export const MAX_TDM_TEAMS = 4;

export function isValidGameMode(value: string | null | undefined): value is GameMode {
  return (
    value === 'playground' ||
    value === 'tdm' ||
    value === 'tdm_kills' ||
    value === 'plasma_harvest'
  );
}

export function normalizeGameMode(value: string | null | undefined): GameMode {
  if (value === 'tdm' || value === 'tdm_kills' || value === 'plasma_harvest') {
    return value;
  }
  return 'playground';
}

/** Modes that use match phases, teams, scores, and results. */
export function isCompetitiveGameMode(mode: GameMode | string | null | undefined): boolean {
  return mode === 'tdm' || mode === 'tdm_kills' || mode === 'plasma_harvest';
}

export function isTimedGameMode(mode: GameMode | string | null | undefined): boolean {
  return mode === 'tdm';
}

export function isKillRaceGameMode(mode: GameMode | string | null | undefined): boolean {
  return mode === 'tdm_kills';
}

export function isPlasmaHarvestGameMode(
  mode: GameMode | string | null | undefined,
): boolean {
  return mode === 'plasma_harvest';
}

/** Force / clamp map selection for modes that require a specific arena. */
export function resolveMapForGameMode(
  gameMode: GameMode | string | null | undefined,
  mapId?: string | null,
): MapId {
  if (isPlasmaHarvestGameMode(gameMode)) return PLASMA_HARVEST_MAP_ID;
  return normalizeMapId(mapId);
}

export function getAllowedMapIdsForGameMode(
  gameMode: GameMode | string | null | undefined,
): readonly MapId[] {
  if (isPlasmaHarvestGameMode(gameMode)) return [PLASMA_HARVEST_MAP_ID];
  return MAP_OPTIONS.map((option) => option.id);
}

/** Melee-only join/respawn (no gun slots) — Plasma Harvest + firing range sandbox. */
export function usesEmptyStartingLoadout(
  gameMode: GameMode | string | null | undefined,
  mapEmptyStartingLoadout?: boolean,
): boolean {
  if (isPlasmaHarvestGameMode(gameMode)) return true;
  return mapEmptyStartingLoadout === true;
}

/** Armory mid-match loadout switching (Tab right panel). */
export function allowsMidMatchLoadoutSwitch(
  gameMode: GameMode | string | null | undefined,
): boolean {
  return !isPlasmaHarvestGameMode(gameMode);
}

export function getGameModeWinCondition(
  mode: GameMode | string | null | undefined,
): MatchWinCondition {
  if (mode === 'tdm') return 'time';
  if (mode === 'tdm_kills') return 'kills';
  if (mode === 'plasma_harvest') return 'install';
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

export function isValidHarvestRoundsToWin(
  value: number | null | undefined,
): value is HarvestRoundsToWin {
  return (
    typeof value === 'number' &&
    (HARVEST_ROUNDS_TO_WIN_OPTIONS as readonly number[]).includes(value)
  );
}

export function normalizeHarvestRoundsToWin(
  value: number | null | undefined,
): HarvestRoundsToWin {
  return isValidHarvestRoundsToWin(value) ? value : DEFAULT_HARVEST_ROUNDS_TO_WIN;
}

/** Resolve create-room rules from mode + lobby picks. */
export function resolveMatchRules(
  mode: GameMode,
  durationSec?: number | null,
  killTarget?: number | null,
  roundsToWin?: number | null,
): { matchDurationSec: number; killLimit: number; roundsToWin: number } {
  if (mode === 'tdm') {
    return {
      matchDurationSec: normalizeTdmDurationSec(durationSec),
      killLimit: 0,
      roundsToWin: 0,
    };
  }
  if (mode === 'tdm_kills') {
    return {
      matchDurationSec: 0,
      killLimit: normalizeKillRaceTarget(killTarget),
      roundsToWin: 0,
    };
  }
  if (mode === 'plasma_harvest') {
    return {
      matchDurationSec: 0,
      killLimit: 0,
      roundsToWin: normalizeHarvestRoundsToWin(roundsToWin),
    };
  }
  return { matchDurationSec: 0, killLimit: 0, roundsToWin: 0 };
}

/** Big-text objective shown during the pre-match countdown. */
export function getMatchObjectiveBanner(
  mode: GameMode | string | null | undefined,
  matchDurationSec: number,
  killLimit: number,
  roundsToWin = 0,
): string {
  if (mode === 'tdm_kills') {
    const target = killLimit > 0 ? killLimit : DEFAULT_KILL_RACE_TARGET;
    return `First to ${target} kills wins`;
  }
  if (mode === 'tdm') {
    const duration = matchDurationSec > 0 ? matchDurationSec : DEFAULT_TDM_DURATION_SEC;
    const mins = Math.max(1, Math.round(duration / 60));
    return `Get as many kills as possible in ${mins} min${mins === 1 ? '' : 's'}`;
  }
  if (mode === 'plasma_harvest') {
    const target =
      roundsToWin > 0 ? roundsToWin : DEFAULT_HARVEST_ROUNDS_TO_WIN;
    return `First to ${target} installs wins the match`;
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

/** Lobby label for Harvest series length (e.g. 3 → "3 OF 5"). */
export function formatHarvestRoundsOptionLabel(roundsToWin: number): string {
  const bestOf = Math.max(1, roundsToWin * 2 - 1);
  return `${roundsToWin} OF ${bestOf}`;
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
  if (
    value === 'countdown' ||
    value === 'playing' ||
    value === 'round_end' ||
    value === 'ended'
  ) {
    return value;
  }
  return 'waiting';
}

export function getCountdownDisplayValue(
  worldTime: number,
  countdownEndAt: number,
): string | null {
  const remaining = countdownEndAt - worldTime;
  if (remaining <= 0) return 'GO';
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
