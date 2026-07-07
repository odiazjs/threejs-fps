import { Game } from '../app/Game';
import { resolveGameJoinIntent } from '../auth/gameJoin';
import { apiGetMe } from '../auth/meApi';
import { ensureSession } from '../auth/playerSession';
import { getServerUrl } from '../config/serverUrl';
import { bootstrapDebugFlags } from '../debug/debugQuery';
import { LoadingOverlay } from '../ui/LoadingOverlay';

async function startGame(): Promise<void> {
  bootstrapDebugFlags();
  const loading = LoadingOverlay.shared();
  loading.show('Joining game...');

  try {
    const session = await ensureSession();
    await apiGetMe();

    console.info('[Game] Colyseus server:', getServerUrl());

    const joinIntent = await resolveGameJoinIntent({
      userId: session.userId,
      username: session.username,
    });
    const game = new Game();
    await game.start(
      { userId: session.userId, username: session.username },
      joinIntent,
      () => loading.hide(),
      (message) => loading.setMessage(message),
    );
  } catch (error) {
    loading.reset();
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Game] failed to join', error);
    alert(
      `Could not join game: ${detail}\n\nServer: ${getServerUrl()}\nCheck that the game server is running and CORS allows this site.`,
    );
    window.location.href = '/lobby.html';
  }
}

void startGame();
