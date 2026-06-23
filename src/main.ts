import { Game } from './app/Game';
import { JoinLobby } from './ui/JoinLobby';

const lobby = new JoinLobby();

lobby.whenJoin(async ({ username, teamId }) => {
  lobby.setLoading(true);
  lobby.showError('');

  try {
    const game = new Game();
    await game.start(username, teamId, () => lobby.hide());
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Game] failed to join', error);
    lobby.showError(`Could not join game: ${detail}`);
    document.getElementById('join-lobby')!.hidden = false;
    lobby.setLoading(false);
  }
});
