import {
  DEFAULT_MAP_ID,
  isValidMapId,
  normalizeMapId,
  type MapId,
} from '../../shared/level/maps';
import {
  DEFAULT_GAME_MODE,
  isValidGameMode,
  normalizeGameMode,
  type GameMode,
} from '../../shared/combat/match';
import type { FpsJoinCredentials } from './joinCredentials';
import { fetchPartyGameLaunch } from './fetchPartyGameLaunch';

const STORAGE_KEY = 'fps_game_join';

export interface GameJoinIntent {
  roomId?: string;
  teamId?: number;
  mode: 'create' | 'join';
  mapId?: string;
  gameMode?: GameMode;
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

function normalizeJoinIntent(raw: Partial<GameJoinIntent>): GameJoinIntent | null {
  const mapId = normalizeMapId(raw.mapId ?? readStoredMapPreference());
  const gameMode = normalizeGameMode(raw.gameMode ?? readStoredGameModePreference());

  if (raw.mode === 'create') {
    return { mode: 'create', mapId, gameMode };
  }

  if (raw.mode === 'join' && typeof raw.roomId === 'string' && raw.roomId.length > 0) {
    return {
      roomId: raw.roomId,
      mode: 'join',
      mapId,
      gameMode,
      ...(typeof raw.teamId === 'number' ? { teamId: raw.teamId } : {}),
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
    if (partyLaunch) return partyLaunch;
  } catch (error) {
    console.warn('[GameJoin] requestGameLaunch failed — falling back to quick match', error);
  }

  const stored = consumeStoredJoinIntent();
  if (stored) return stored;

  return normalizeJoinIntent({ mode: 'create' });
}
