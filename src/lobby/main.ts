import { handoffPageBoot } from '../app/pageBoot';
import { apiGetMe } from '../auth/meApi';
import { getKdRatio, ensureSession, logout } from '../auth/playerSession';
import { FriendsPanel } from './FriendsPanel';
import { LobbyClient } from './LobbyClient';
import { LobbyScene } from './LobbyScene';
import { LoadingOverlay } from '../ui/LoadingOverlay';

const loading = LoadingOverlay.shared();
loading.show('Loading lobby...');
handoffPageBoot();

async function startLobby(): Promise<void> {
  try {
    const session = await ensureSession();
    const scene = new LobbyScene(document.getElementById('lobby-canvas')!, session.userId);
    const lobbyClient = new LobbyClient();

    const me = await Promise.all([
      apiGetMe(),
      scene.whenReady(),
      lobbyClient
        .connect({ userId: session.userId, username: session.username })
        .then(async () => {
          const panel = new FriendsPanel(lobbyClient);
          panel.onPartySnapshot((data) => {
            scene.setPartyMembers(data.members);
          });
          await panel.init();
        }),
    ]).then(([profile]) => profile);

    document.getElementById('lobby-username')!.textContent = me.displayName;
    document.getElementById('lobby-email')!.textContent = me.email;
    document.getElementById('stat-kills')!.textContent = String(me.stats.kills);
    document.getElementById('stat-kd')!.textContent = getKdRatio(me.stats);

    const logoutBtn = document.getElementById('lobby-logout-btn') as HTMLButtonElement;
    logoutBtn.addEventListener('click', () => {
      logoutBtn.disabled = true;
      void logout();
    });

    const joinBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;
    joinBtn.addEventListener('click', () => {
      if (loading.active) return;
      loading.show('Joining game...');
      joinBtn.disabled = true;
      window.location.href = '/game.html';
    });

    document.getElementById('lobby-weapons-btn')!.addEventListener('click', () => {
      if (loading.active) return;
      window.location.href = '/weapons.html';
    });

    document.getElementById('lobby-leaderboard-btn')!.addEventListener('click', () => {
      if (loading.active) return;
      window.location.href = '/leaderboard.html';
    });

    window.addEventListener('pagehide', () => {
      void lobbyClient.disconnect();
      scene.dispose();
    });
  } catch (error) {
    console.warn('[Lobby] failed to initialize', error);
    const status = document.getElementById('friends-status');
    if (status) {
      status.textContent =
        error instanceof Error ? error.message : 'Could not load lobby';
    }
  } finally {
    loading.hide();
  }
}

void startLobby();
