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
import {
  FPS_JOIN_INTENT_MESSAGE,
  FPS_REQUEST_JOIN_INTENT_MESSAGE,
  type GameJoinIntentPayload,
  type GameJoinIntentResponseMessage,
} from '../../shared/network/gameOverlayMessages';

const STORAGE_KEY = 'fps_game_join';
const PARENT_INTENT_TIMEOUT_MS = 3_000;

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

function payloadToIntent(payload: GameJoinIntentPayload | null): GameJoinIntent | null {
  if (!payload) return null;
  return normalizeJoinIntent(payload);
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

function requestJoinIntentFromParent(): Promise<GameJoinIntent | null> {
  return new Promise((resolve) => {
    const origin = window.location.origin;

    const finish = (intent: GameJoinIntent | null) => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      resolve(intent);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data as GameJoinIntentResponseMessage | null;
      if (data?.type !== FPS_JOIN_INTENT_MESSAGE) return;
      finish(payloadToIntent(data.intent));
    };

    const timeoutId = window.setTimeout(() => {
      finish(null);
    }, PARENT_INTENT_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: FPS_REQUEST_JOIN_INTENT_MESSAGE }, origin);
  });
}

export function setGameJoinIntent(intent: GameJoinIntent): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

/**
 * Resolve how to join the match. Iframe games request intent from the lobby
 * parent via postMessage; full-page navigation reads one-shot sessionStorage.
 */
export async function resolveGameJoinIntent(): Promise<GameJoinIntent | null> {
  if (window.parent !== window) {
    return requestJoinIntentFromParent();
  }
  return consumeStoredJoinIntent();
}

/** @deprecated Use resolveGameJoinIntent — kept for callers that cannot await. */
export function consumeGameJoinIntent(): GameJoinIntent | null {
  return consumeStoredJoinIntent();
}
