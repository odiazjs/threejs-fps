import {
  DEFAULT_MAP_ID,
  isValidMapId,
  normalizeMapId,
  type MapId,
} from '../../shared/level/maps';

const STORAGE_KEY = 'fps_game_join';

export interface GameJoinIntent {
  roomId?: string;
  teamId?: number;
  mode: 'create' | 'join';
  mapId?: string;
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

    if (parsed.mode === 'create') {
      return { mode: 'create', mapId };
    }

    if (parsed.mode === 'join' && typeof parsed.roomId === 'string') {
      return {
        roomId: parsed.roomId,
        mode: 'join',
        mapId,
        ...(typeof parsed.teamId === 'number' ? { teamId: parsed.teamId } : {}),
      };
    }
  } catch {
    // ignore malformed payload
  }

  return null;
}
