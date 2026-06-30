import { Game } from '../app/Game';
import { consumeGameJoinIntent } from '../auth/gameJoin';
import { apiGetMe } from '../auth/meApi';
import { ensureSession } from '../auth/playerSession';
import { LoadingOverlay } from '../ui/LoadingOverlay';

async function startGame(): Promise<void> {
  const loading = LoadingOverlay.shared();
  loading.show('Joining game...');

  try {
    const session = await ensureSession();
    await apiGetMe();

    const joinIntent = consumeGameJoinIntent();
    const game = new Game();
    await game.start(
      { userId: session.userId, username: session.username },
      joinIntent,
      () => loading.hide(),
    );
  } catch (error) {
    loading.reset();
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Game] failed to join', error);
    alert(`Could not join game: ${detail}`);
    window.location.href = '/lobby.html';
  }
}

void startGame();
