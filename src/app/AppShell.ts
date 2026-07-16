import type { AppPresenceView } from '../../shared/network/appView';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { waitForPaint } from '../ui/waitForPaint';
import type { LobbyClient } from '../lobby/LobbyClient';
import type { LobbyScene } from '../lobby/LobbyScene';
import type { FriendsPanel } from '../lobby/FriendsPanel';
import { LeaderboardView } from '../lobby/views/LeaderboardView';
import { refreshLobbyProfileStats } from '../lobby/lobbyProfileStats';
import { SettingsView } from '../lobby/views/SettingsView';
import { consumeCharacterMeshReload } from '../content/activeCharacterMesh';
import { StoreView } from '../lobby/views/StoreView';
import { WeaponsView } from '../lobby/views/WeaponsView';

export type ShellView = 'lobby' | 'weapons' | 'leaderboard' | 'settings' | 'store';

const PAGE_CLASS_BY_VIEW: Record<ShellView, string> = {
  lobby: 'lobby-page',
  weapons: 'weapons-page',
  leaderboard: 'leaderboard-page',
  settings: 'settings-page',
  store: 'store-page',
};

const TITLE_BY_VIEW: Record<ShellView, string> = {
  lobby: 'Three.js FPS — Lobby',
  weapons: 'Three.js FPS — Weapons',
  leaderboard: 'Three.js FPS — Leaderboard',
  settings: 'Three.js FPS — Settings',
  store: 'Three.js FPS — Store',
};

const LOADING_MESSAGE_BY_VIEW: Partial<Record<ShellView, string>> = {
  weapons: 'Loading weapons...',
  leaderboard: 'Loading leaderboard...',
  store: 'Loading store...',
};

export function parseShellViewFromUrl(): ShellView {
  const view = new URLSearchParams(window.location.search).get('view');
  if (
    view === 'weapons'
    || view === 'leaderboard'
    || view === 'settings'
    || view === 'store'
  ) {
    return view;
  }
  return 'lobby';
}

export class AppShell {
  private currentView: ShellView = 'lobby';
  private readonly weaponsView = new WeaponsView();
  private readonly leaderboardView = new LeaderboardView();
  private readonly settingsView = new SettingsView();
  private readonly storeView = new StoreView();
  private readonly loading = LoadingOverlay.shared();
  private navigating = false;

  constructor(
    private readonly lobbyClient: LobbyClient,
    private readonly lobbyScene: LobbyScene,
    private readonly friendsPanel: FriendsPanel | null = null,
  ) {
    window.addEventListener('popstate', this.onPopState);
  }

  bindNavigation(): void {
    document.getElementById('lobby-weapons-btn')!.addEventListener('click', () => {
      void this.showView('weapons');
    });
    document.getElementById('lobby-store-btn')!.addEventListener('click', () => {
      void this.showView('store');
    });
    document.getElementById('lobby-leaderboard-btn')!.addEventListener('click', () => {
      void this.showView('leaderboard');
    });
    document.getElementById('lobby-settings-btn')!.addEventListener('click', () => {
      void this.showView('settings');
    });
    document.getElementById('weapons-back-btn')!.addEventListener('click', () => {
      void this.showView('lobby');
    });
    document.getElementById('store-back-btn')!.addEventListener('click', () => {
      void this.showView('lobby');
    });
    document.getElementById('leaderboard-back-btn')!.addEventListener('click', () => {
      void this.showView('lobby');
    });
    document.getElementById('settings-back-btn')!.addEventListener('click', () => {
      void this.showView('lobby');
    });
  }

  async initFromUrl(): Promise<void> {
    const view = parseShellViewFromUrl();
    if (view !== 'lobby') {
      await this.showView(view);
    }
  }

  async showView(view: ShellView): Promise<void> {
    if (this.navigating || view === this.currentView) return;

    this.navigating = true;
    const loadingMessage = LOADING_MESSAGE_BY_VIEW[view];
    if (loadingMessage) {
      this.loading.show(loadingMessage);
      await waitForPaint();
    }

    try {
      await this.deactivateView(this.currentView);
      this.currentView = view;
      this.applyBodyClass(view);
      await this.activateView(view);
      this.lobbyClient.setAppView(this.presenceViewFor(view));
      if (view === 'lobby') {
        this.friendsPanel?.refreshPresence();
      }
      this.syncUrl(view);
      document.title = TITLE_BY_VIEW[view];
      if (loadingMessage) {
        await waitForPaint();
      }
    } finally {
      if (loadingMessage) {
        this.loading.hide();
      }
      this.friendsPanel?.syncControls();
      this.navigating = false;
    }
  }

  teardown(): void {
    window.removeEventListener('popstate', this.onPopState);
    this.weaponsView.unmount();
    this.leaderboardView.unmount();
    this.settingsView.unmount();
    this.storeView.unmount();
    this.lobbyScene.dispose();
    void this.lobbyClient.disconnect();
  }

  /** Re-sync lobby presence and friend list after closing the in-lobby game overlay. */
  syncPresenceAfterGame(): void {
    this.lobbyClient.setAppView(this.presenceViewFor(this.currentView));
    this.friendsPanel?.refreshPresence();
  }

  private readonly onPopState = (): void => {
    const view = parseShellViewFromUrl();
    if (view === this.currentView) return;
    void this.showView(view);
  };

  private presenceViewFor(view: ShellView): AppPresenceView {
    return view === 'lobby' ? 'lobby' : 'menus';
  }

  private syncUrl(view: ShellView): void {
    const nextUrl = view === 'lobby' ? '/lobby.html' : `/lobby.html?view=${view}`;
    if (`${window.location.pathname}${window.location.search}` === nextUrl) return;
    history.pushState({ view }, '', nextUrl);
  }

  private applyBodyClass(view: ShellView): void {
    document.body.classList.remove(
      'lobby-page',
      'weapons-page',
      'leaderboard-page',
      'settings-page',
      'store-page',
    );
    document.body.classList.add(PAGE_CLASS_BY_VIEW[view]);
  }

  private async deactivateView(view: ShellView): Promise<void> {
    document.getElementById(`app-view-${view}`)!.hidden = true;

    if (view === 'lobby') {
      this.lobbyScene.setActive(false);
    } else if (view === 'weapons') {
      this.weaponsView.unmount();
    } else if (view === 'leaderboard') {
      this.leaderboardView.unmount();
    } else if (view === 'store') {
      this.storeView.unmount();
    } else {
      this.settingsView.unmount();
    }
  }

  private async activateView(view: ShellView): Promise<void> {
    const viewEl = document.getElementById(`app-view-${view}`)!;
    viewEl.hidden = false;

    if (view === 'lobby') {
      this.lobbyScene.setActive(true);
      void refreshLobbyProfileStats();
      // Refresh party + local look after store / armory changes.
      this.lobbyClient.requestPartySnapshot();
      if (consumeCharacterMeshReload()) {
        void this.lobbyScene.remountCharacter();
      } else {
        void this.lobbyScene.refreshFromDefaultLoadout();
      }
      return;
    }

    if (view === 'settings') {
      this.settingsView.mount();
      return;
    }

    viewEl.classList.add('app-view--loading');
    await waitForPaint();

    try {
      if (view === 'weapons') {
        await this.weaponsView.mount();
      } else if (view === 'store') {
        await this.storeView.mount();
      } else {
        await this.leaderboardView.mount();
      }
    } finally {
      viewEl.classList.remove('app-view--loading');
      if (view === 'weapons') {
        await waitForPaint();
        this.weaponsView.refreshViewport();
      } else if (view === 'store') {
        await waitForPaint();
        this.storeView.refreshViewport();
      }
    }
  }
}
