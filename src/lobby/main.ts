import '../styles/pages.css';
import { apiGetMe } from '../auth/meApi';
import { getKdRatio, ensureSession, logout } from '../auth/playerSession';
import { FriendsPanel } from './FriendsPanel';
import { LobbyClient } from './LobbyClient';
import { LobbyScene } from './LobbyScene';

async function startLobby(): Promise<void> {
  const session = await ensureSession();
  const me = await apiGetMe();

  document.getElementById('lobby-username')!.textContent = me.displayName;
  document.getElementById('lobby-email')!.textContent = me.email;
  document.getElementById('stat-kills')!.textContent = String(me.stats.kills);
  document.getElementById('stat-kd')!.textContent = getKdRatio(me.stats);

  const logoutBtn = document.getElementById('lobby-logout-btn') as HTMLButtonElement;
  logoutBtn.addEventListener('click', () => {
    logoutBtn.disabled = true;
    void logout();
  });

  const scene = new LobbyScene(document.getElementById('lobby-canvas')!);
  const lobbyClient = new LobbyClient();
  const joinBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;
  joinBtn.addEventListener('click', () => {
    joinBtn.disabled = true;
    joinBtn.textContent = 'JOINING...';
    window.location.href = '/game.html';
  });

  lobbyClient.connect({ userId: session.userId, username: session.username }).then(async () => {
    const panel = new FriendsPanel(lobbyClient);
    await panel.init();
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
}

void startLobby();
