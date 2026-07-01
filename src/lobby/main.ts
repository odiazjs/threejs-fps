import { handoffPageBoot } from '../app/pageBoot';
import { AppShell, parseShellViewFromUrl } from '../app/AppShell';
import { initAppSession } from '../app/bootstrap';
import { logout } from '../auth/playerSession';
import { FriendsPanel } from './FriendsPanel';
import { LobbyClient } from './LobbyClient';
import { LobbyScene } from './LobbyScene';
import { refreshLobbyProfileStats } from './lobbyProfileStats';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import type { AppPresenceView } from '../../shared/network/appView';

const loading = LoadingOverlay.shared();
loading.show('Loading lobby...');
handoffPageBoot();

function shellPresenceView(view: ReturnType<typeof parseShellViewFromUrl>): AppPresenceView {
  return view === 'lobby' ? 'lobby' : 'menus';
}

async function startLobby(): Promise<void> {
  let appShell: AppShell | null = null;
  let friendsPanel: FriendsPanel | null = null;
  const initialView = parseShellViewFromUrl();

  try {
    const session = await initAppSession();
    const scene = new LobbyScene(document.getElementById('lobby-canvas')!, session.userId);
    const lobbyClient = new LobbyClient();
    friendsPanel = new FriendsPanel(lobbyClient);
    friendsPanel.onPartySnapshot((data) => {
      scene.setPartyMembers(data.members);
    });
    appShell = new AppShell(lobbyClient, scene, friendsPanel);

    await Promise.all([
      refreshLobbyProfileStats(),
      scene.whenReady(),
      lobbyClient.connect({ userId: session.userId, username: session.username }).then(async () => {
        lobbyClient.setAppView(shellPresenceView(initialView));
        await friendsPanel.init();
      }),
    ]);

    appShell.bindNavigation();
    if (initialView !== 'lobby') {
      await appShell.showView(initialView);
    }

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

    window.addEventListener('pagehide', () => {
      appShell?.teardown();
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
    friendsPanel?.syncControls();
  }
}

void startLobby();
