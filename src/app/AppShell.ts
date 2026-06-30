import type { AppPresenceView } from '../../shared/network/appView';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import type { LobbyClient } from '../lobby/LobbyClient';
import type { LobbyScene } from '../lobby/LobbyScene';
import type { FriendsPanel } from '../lobby/FriendsPanel';
import { LeaderboardView } from '../lobby/views/LeaderboardView';
import { WeaponsView } from '../lobby/views/WeaponsView';

export type ShellView = 'lobby' | 'weapons' | 'leaderboard';

const PAGE_CLASS_BY_VIEW: Record<ShellView, string> = {
  lobby: 'lobby-page',
  weapons: 'weapons-page',
  leaderboard: 'leaderboard-page',
};

const TITLE_BY_VIEW: Record<ShellView, string> = {
  lobby: 'Three.js FPS — Lobby',
  weapons: 'Three.js FPS — Weapons',
  leaderboard: 'Three.js FPS — Leaderboard',
};

const LOADING_MESSAGE_BY_VIEW: Partial<Record<ShellView, string>> = {
  weapons: 'Loading weapons...',
  leaderboard: 'Loading leaderboard...',
};

export function parseShellViewFromUrl(): ShellView {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'weapons' || view === 'leaderboard') return view;
  return 'lobby';
}

export class AppShell {
  private currentView: ShellView = 'lobby';
  private readonly weaponsView = new WeaponsView();
  private readonly leaderboardView = new LeaderboardView();
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
    document.getElementById('lobby-leaderboard-btn')!.addEventListener('click', () => {
      void this.showView('leaderboard');
    });
    document.getElementById('weapons-back-btn')!.addEventListener('click', () => {
      void this.showView('lobby');
    });
    document.getElementById('leaderboard-back-btn')!.addEventListener('click', () => {
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
    this.lobbyScene.dispose();
    void this.lobbyClient.disconnect();
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
    document.body.classList.remove('lobby-page', 'weapons-page', 'leaderboard-page');
    document.body.classList.add(PAGE_CLASS_BY_VIEW[view]);
  }

  private async deactivateView(view: ShellView): Promise<void> {
    document.getElementById(`app-view-${view}`)!.hidden = true;

    if (view === 'lobby') {
      this.lobbyScene.setActive(false);
    } else if (view === 'weapons') {
      this.weaponsView.unmount();
    } else {
      this.leaderboardView.unmount();
    }
  }

  private async activateView(view: ShellView): Promise<void> {
    document.getElementById(`app-view-${view}`)!.hidden = false;

    if (view === 'lobby') {
      this.lobbyScene.setActive(true);
    } else if (view === 'weapons') {
      await this.weaponsView.mount();
    } else {
      await this.leaderboardView.mount();
    }
  }
}
