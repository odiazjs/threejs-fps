import '../styles/pages.css';
import { getKdRatio, requireSession } from '../auth/playerSession';
import { FriendsPanel } from './FriendsPanel';
import { LobbyClient } from './LobbyClient';
import { LobbyScene } from './LobbyScene';

const session = requireSession();

document.getElementById('lobby-username')!.textContent = session.username;
document.getElementById('stat-kills')!.textContent = String(session.kills);
document.getElementById('stat-kd')!.textContent = getKdRatio(session);

const scene = new LobbyScene(document.getElementById('lobby-canvas')!);
const lobbyClient = new LobbyClient();
const joinBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;
joinBtn.addEventListener('click', () => {
  joinBtn.disabled = true;
  joinBtn.textContent = 'JOINING...';
  window.location.href = '/game.html';
});

lobbyClient.connect(session.username).then(() => {
  new FriendsPanel(lobbyClient, session.username);
}).catch((error) => {
  console.warn('[Lobby] failed to connect', error);
  const status = document.getElementById('friends-status');
  if (status) {
    status.textContent = 'Could not connect to lobby server';
  }
});

window.addEventListener('pagehide', () => {
  void lobbyClient.disconnect();
  scene.dispose();
});
