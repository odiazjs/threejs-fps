const STORAGE_KEY = 'fps_game_join';

export interface GameJoinIntent {
  roomId: string;
  teamId: number;
  mode: 'create' | 'join';
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
    if (
      typeof parsed.roomId === 'string' &&
      typeof parsed.teamId === 'number' &&
      (parsed.mode === 'create' || parsed.mode === 'join')
    ) {
      return parsed;
    }
  } catch {
    // ignore malformed payload
  }

  return null;
}
