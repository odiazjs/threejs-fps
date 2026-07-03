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

export function setGameJoinIntent(intent: GameJoinIntent): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

export function consumeGameJoinIntent(): GameJoinIntent | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  sessionStorage.removeItem(STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw) as GameJoinIntent;
    const mapId = normalizeMapId(parsed.mapId ?? readStoredMapPreference());
    const gameMode = normalizeGameMode(parsed.gameMode ?? readStoredGameModePreference());

    if (parsed.mode === 'create') {
      return { mode: 'create', mapId, gameMode };
    }

    if (parsed.mode === 'join' && typeof parsed.roomId === 'string') {
      return {
        roomId: parsed.roomId,
        mode: 'join',
        mapId,
        gameMode,
        ...(typeof parsed.teamId === 'number' ? { teamId: parsed.teamId } : {}),
      };
    }
  } catch {
    // ignore malformed payload
  }

  return null;
}
