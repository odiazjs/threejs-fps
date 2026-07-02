import type { MapId } from '../level/maps.js';

export type GameMode = 'ffa' | 'tdm';

export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'ended';

export const TDM_COUNTDOWN_SEC = 5;
export const TDM_MATCH_DURATION_SEC = 120;
export const TDM_KILL_POINTS = 10;
export const MAX_TDM_TEAMS = 4;

export function defaultGameModeForMap(mapId: MapId): GameMode {
  return mapId === 'killhouse_small' ? 'tdm' : 'ffa';
}

/** Humans required before a TDM match leaves the lobby. */
export function defaultTdmExpectedPlayers(mapId: MapId): number {
  return mapId === 'killhouse_small' ? 4 : 2;
}

/** Team layout for TDM based on how many humans are in the match. */
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
  const duration = matchDurationSec > 0 ? matchDurationSec : TDM_MATCH_DURATION_SEC;
  if (phase !== 'playing') {
    return duration;
  }
  if (matchEndAt > 0) {
    return Math.max(0, matchEndAt - worldTime);
  }
  if (matchStartAt > 0) {
    return Math.max(0, matchStartAt + duration - worldTime);
  }
  return duration;
}
