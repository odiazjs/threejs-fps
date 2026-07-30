import { handoffPageBoot } from '../app/pageBoot';
import { AppShell, parseShellViewFromUrl } from '../app/AppShell';
import { initAppSession } from '../app/bootstrap';
import { runClientAssetPrewarm } from '../assets/clientAssetPrewarm';
import { isClientAssetPrewarmComplete } from '../assets/clientAssetPrewarmState';
import { logout } from '../auth/playerSession';
import { apiListCharacters } from '../auth/charactersApi';
import { apiListStoreItems } from '../auth/storeApi';
import {
  consumeCharacterMeshReload,
  setActiveCharacterId,
} from '../content/activeCharacterMesh';
import {
  consumeOperatorReload,
  setActiveOperatorId,
} from '../content/activeOperatorCharacter';
import { clearCharacterMeshCache } from '../player/characterModel';
import { bootstrapDebugFlags } from '../debug/debugQuery';
import { FriendsPanel } from './FriendsPanel';
import { LobbyClient } from './LobbyClient';
import { LobbyScene } from './LobbyScene';
import { refreshLobbyProfileStats } from './lobbyProfileStats';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { PlasmaMineralsStoreModal } from '../ui/PlasmaMineralsStoreModal';
import { initLobbyMusic, initUiSounds } from '../audio/initMenuAudio';
import { initLobbyMapSelector } from './mapSelection';
import { initLobbyGameModeSelector } from './gameModeSelection';
import { initLobbyPanelCollapse } from './lobbyPanelCollapse';
import { onGameOverlayClosed, setGameOverlayBackgroundHooks } from './launchGameOverlay';
import { maybeShowMatchXpResultsModal } from './showMatchXpResults';
import { maybeShowSeasonWelcomeModal } from './seasonWelcome';
import type { AppPresenceView } from '../../shared/network/appView';

const loading = LoadingOverlay.shared();
loading.show(
  isClientAssetPrewarmComplete()
    ? 'Loading lobby...'
    : 'Preparing game assets...',
);
bootstrapDebugFlags();
handoffPageBoot();

function shellPresenceView(view: ReturnType<typeof parseShellViewFromUrl>): AppPresenceView {
  return view === 'lobby' ? 'lobby' : 'menus';
}

async function startLobby(): Promise<void> {
  let appShell: AppShell | null = null;
  let friendsPanel: FriendsPanel | null = null;
  let welcomeUserId: string | null = null;
  let showSeasonWelcome = false;
  const initialView = parseShellViewFromUrl();

  try {
    // Always run — returns immediately when this build's manifest is already cached,
    // otherwise downloads new/changed maps, models, images, and audio.
    await runClientAssetPrewarm((message) => loading.setMessage(message));
    loading.setMessage('Loading lobby...');

    const session = await initAppSession();
    try {
      const [store, characters] = await Promise.all([
        apiListStoreItems(),
        apiListCharacters(),
      ]);
      setActiveCharacterId(store.selectedCharacterId);
      setActiveOperatorId(characters.selectedCharacterId);
      clearCharacterMeshCache();
      // Initial LobbyScene load applies selection; don't remount again on first paint.
      consumeCharacterMeshReload();
      consumeOperatorReload();
    } catch (error) {
      console.warn('[Lobby] Could not sync store / characters', error);
    }
    const scene = new LobbyScene(document.getElementById('lobby-canvas')!, session.userId);
    setGameOverlayBackgroundHooks(
      () => scene.setActive(false),
      () => scene.setActive(true),
    );
    const lobbyClient = new LobbyClient();
    friendsPanel = new FriendsPanel(lobbyClient);
    friendsPanel.onPartySnapshot((data) => {
      scene.setPartyMembers(data.members);
    });
    appShell = new AppShell(lobbyClient, scene, friendsPanel);

    await Promise.all([
      initUiSounds(),
      initLobbyMusic(),
      refreshLobbyProfileStats(),
      scene.whenReady(),
      lobbyClient.connect({ userId: session.userId, username: session.username }).then(async () => {
        lobbyClient.setAppView(shellPresenceView(initialView));
        await friendsPanel?.init();
      }),
    ]);

    appShell.bindNavigation();
    initLobbyPanelCollapse();
    initLobbyGameModeSelector();
    initLobbyMapSelector();
    const plasmaStore = new PlasmaMineralsStoreModal(
      document.getElementById('plasma-minerals-store-modal')!,
    );
    plasmaStore.bind();
    if (initialView !== 'lobby') {
      await appShell.showView(initialView);
    }

    const logoutBtn = document.getElementById('lobby-logout-btn') as HTMLButtonElement;
    logoutBtn.addEventListener('click', () => {
      logoutBtn.disabled = true;
      void logout();
    });

    const joinBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;
    onGameOverlayClosed(() => {
      loading.reset();
      joinBtn.disabled = false;
      void refreshLobbyProfileStats();
      void lobbyClient.reconnect({ userId: session.userId, username: session.username }).then(() => {
        lobbyClient.setAppView(shellPresenceView(parseShellViewFromUrl()));
        appShell?.syncPresenceAfterGame();
        friendsPanel?.syncAfterGameReconnect();
      });
      void maybeShowMatchXpResultsModal({ withLoading: true });
    });

    // Cold boot / refresh after closing the tab on the match-end screen.
    const showedMatchXp = await maybeShowMatchXpResultsModal();
    welcomeUserId = session.userId;
    showSeasonWelcome = !showedMatchXp && initialView === 'lobby';

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

  if (showSeasonWelcome && welcomeUserId && appShell) {
    const shell = appShell;
    void maybeShowSeasonWelcomeModal({
      userId: welcomeUserId,
      onViewSeason: () => {
        void shell.showView('ranked');
      },
    });
  }
}

void startLobby();
