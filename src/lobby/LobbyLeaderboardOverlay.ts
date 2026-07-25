import { playStatsIncomingSound } from '../audio/StatsIncomingSound';
import { apiGetLeaderboard } from '../auth/leaderboardApi';
import { playLeaderboardEntrance, populateLeaderboardList } from './leaderboardUi';

/**
 * Centered lobby leaderboard panel shown after the camera flies to `tower_control`.
 */
export class LobbyLeaderboardOverlay {
  private root: HTMLElement | null = null;
  private mountToken = 0;
  private onCloseRequest: (() => void) | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  setCloseHandler(handler: (() => void) | null): void {
    this.onCloseRequest = handler;
  }

  async open(): Promise<void> {
    this.dispose();
    const token = ++this.mountToken;

    const root = document.createElement('div');
    root.className = 'lobby-landmark-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Global player rankings');

    const panel = document.createElement('aside');
    panel.className = 'lobby-landmark-panel leaderboard-shell hud-panel hud-panel--lg';

    const subtitle = document.createElement('p');
    subtitle.className = 'leaderboard-subtitle hud-subtitle hud-subtitle--center leaderboard-swipe';
    subtitle.textContent = 'GLOBAL STATS / LEADERBOARD';

    const title = document.createElement('h1');
    title.className = 'leaderboard-title hud-title hud-title--hero leaderboard-swipe';
    title.textContent = 'LEADERBOARD';

    const status = document.createElement('p');
    status.className = 'leaderboard-status leaderboard-swipe';
    status.textContent = 'Loading...';

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lobby-landmark-close lobby-top-back-btn leaderboard-swipe';
    closeBtn.textContent = 'BACK TO LOBBY';
    closeBtn.addEventListener('click', () => {
      this.onCloseRequest?.();
    });

    panel.append(subtitle, title, status, list, closeBtn);
    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;

    let data;
    try {
      data = await apiGetLeaderboard();
    } catch (error) {
      if (token !== this.mountToken || this.root !== root) return;
      status.textContent = 'Failed to load leaderboard';
      console.warn('[LobbyLeaderboardOverlay] Fetch failed', error);
      playLeaderboardEntrance(root, [subtitle, title, status, closeBtn]);
      return;
    }

    if (token !== this.mountToken || this.root !== root) return;

    const { swipeEls, nextAnimIndex } = populateLeaderboardList(list, status, data, 3);
    closeBtn.style.setProperty('--swipe-delay', `${nextAnimIndex * 90}ms`);

    const entranceEls: HTMLElement[] = [subtitle, title, status, ...swipeEls, closeBtn];
    playLeaderboardEntrance(root, entranceEls);
    playStatsIncomingSound();
  }

  dispose(): void {
    this.mountToken += 1;
    if (!this.root) return;
    this.root.remove();
    this.root = null;
  }
}
