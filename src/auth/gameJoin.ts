import {
  DEFAULT_MAP_ID,
  isValidMapId,
  type MapId,
} from '../../shared/level/maps';
import {
  DEFAULT_GAME_MODE,
  isValidGameMode,
  normalizeGameMode,
  normalizeKillRaceTarget,
  normalizeTdmDurationSec,
  resolveMapForGameMode,
  resolveMatchRules,
  type GameMode,
} from '../../shared/combat/match';
import type { GameLaunchParticipant } from '../../shared/network/gameInvite';
import type { FpsJoinCredentials } from './joinCredentials';
import { fetchPartyGameLaunch } from './fetchPartyGameLaunch';

const STORAGE_KEY = 'fps_game_join';

export interface GameJoinIntent {
  roomId?: string;
  teamId?: number;
  mode: 'create' | 'join';
  mapId?: string;
  gameMode?: GameMode;
  matchDurationSec?: number;
  killLimit?: number;
  /** Prefetched at LAUNCH so the pre-match screen can render immediately. */
  participants?: GameLaunchParticipant[];
}

function normalizeParticipants(
  raw: unknown,
): GameLaunchParticipant[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const participants: GameLaunchParticipant[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Partial<GameLaunchParticipant>;
    if (typeof row.username !== 'string' || row.username.length === 0) continue;
    participants.push({
      userId: typeof row.userId === 'string' ? row.userId : '',
      username: row.username,
      teamId: row.teamId === 1 ? 1 : 0,
      rankLevel: Math.max(1, Number(row.rankLevel) || 1),
      careerKills: Math.max(0, Number(row.careerKills) || 0),
      careerDeaths: Math.max(0, Number(row.careerDeaths) || 0),
      xp: Math.max(0, Number(row.xp) || 0),
      ...(typeof row.rankTier === 'string' ? { rankTier: row.rankTier } : {}),
      ...(typeof row.rankDivision === 'number'
        ? { rankDivision: row.rankDivision }
        : {}),
      ...(typeof row.rankName === 'string' ? { rankName: row.rankName } : {}),
      ...(typeof row.selectedOperatorId === 'string'
        ? { selectedOperatorId: row.selectedOperatorId }
        : {}),
    });
  }
  return participants.length > 0 ? participants : undefined;
}

function readStoredGameModePreference(): GameMode {
  try {
    const stored = localStorage.getItem('fps_selected_game_mode');
    return isValidGameMode(stored) ? stored : DEFAULT_GAME_MODE;
  } catch {
    return DEFAULT_GAME_MODE;
  }
}

function readStoredMapPreference(): MapId {
  try {
    const stored = localStorage.getItem('fps_selected_map_id');
    return isValidMapId(stored) ? stored : DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
}

function readStoredDurationPreference(): number {
  try {
    return normalizeTdmDurationSec(Number(localStorage.getItem('fps_selected_match_duration_sec')));
  } catch {
    return normalizeTdmDurationSec(undefined);
  }
}

function readStoredKillTargetPreference(): number {
  try {
    return normalizeKillRaceTarget(Number(localStorage.getItem('fps_selected_kill_race_target')));
  } catch {
    return normalizeKillRaceTarget(undefined);
  }
}

function normalizeJoinIntent(raw: Partial<GameJoinIntent>): GameJoinIntent | null {
  const gameMode = normalizeGameMode(raw.gameMode ?? readStoredGameModePreference());
  const mapId = resolveMapForGameMode(
    gameMode,
    raw.mapId ?? readStoredMapPreference(),
  );
  const rules = resolveMatchRules(
    gameMode,
    raw.matchDurationSec ?? readStoredDurationPreference(),
    raw.killLimit ?? readStoredKillTargetPreference(),
  );

  const participants = normalizeParticipants(raw.participants);

  if (raw.mode === 'create') {
    return {
      mode: 'create',
      mapId,
      gameMode,
      matchDurationSec: rules.matchDurationSec,
      killLimit: rules.killLimit,
      ...(participants ? { participants } : {}),
    };
  }

  if (raw.mode === 'join' && typeof raw.roomId === 'string' && raw.roomId.length > 0) {
    return {
      roomId: raw.roomId,
      mode: 'join',
      mapId,
      gameMode,
      matchDurationSec: rules.matchDurationSec,
      killLimit: rules.killLimit,
      ...(typeof raw.teamId === 'number' ? { teamId: raw.teamId } : {}),
      ...(participants ? { participants } : {}),
    };
  }

  return null;
}

function consumeStoredJoinIntent(): GameJoinIntent | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  sessionStorage.removeItem(STORAGE_KEY);
  try {
    return normalizeJoinIntent(JSON.parse(raw) as Partial<GameJoinIntent>);
  } catch {
    return null;
  }
}

export function setGameJoinIntent(intent: GameJoinIntent): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

/**
 * Party matches: pending launch from lobby WebSocket (authoritative).
 * Quick match / full-page nav: sessionStorage or create with lobby preferences.
 */
export async function resolveGameJoinIntent(
  credentials: FpsJoinCredentials,
): Promise<GameJoinIntent | null> {
  try {
    const partyLaunch = await fetchPartyGameLaunch(credentials);
    if (partyLaunch) {
      // Drop any lobby-stashed intent so it can't leak into a later match.
      sessionStorage.removeItem(STORAGE_KEY);
      return partyLaunch;
    }
  } catch (error) {
    console.warn('[GameJoin] requestGameLaunch failed — falling back to quick match', error);
  }

  const stored = consumeStoredJoinIntent();
  if (stored) return stored;

  return normalizeJoinIntent({ mode: 'create' });
}
