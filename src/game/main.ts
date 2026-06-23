import { Game } from '../app/Game';
import { consumeGameJoinIntent } from '../auth/gameJoin';
import { getSession } from '../auth/playerSession';

const session = getSession();
if (!session) {
  window.location.replace('/');
} else {
  const joinIntent = consumeGameJoinIntent();
  const game = new Game();
  game.start(session.username, joinIntent).catch((error) => {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Game] failed to join', error);
    alert(`Could not join game: ${detail}`);
    window.location.href = '/lobby.html';
  });
}
