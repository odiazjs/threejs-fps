import { playStatsIncomingSound } from '../../audio/StatsIncomingSound';
import { apiGetLeaderboard } from '../../auth/leaderboardApi';
import { playLeaderboardEntrance, populateLeaderboardList } from '../leaderboardUi';

export class LeaderboardView {
  async mount(): Promise<void> {
    const root = document.getElementById('app-view-leaderboard')!;
    const list = document.getElementById('leaderboard-list')!;
    const status = document.getElementById('leaderboard-status')!;
    const backBtn = document.getElementById('leaderboard-back-btn') as HTMLButtonElement;
    const subtitle = root.querySelector('.leaderboard-subtitle') as HTMLElement;
    const title = root.querySelector('.leaderboard-title') as HTMLElement;

    root.classList.remove('leaderboard-visible');
    list.replaceChildren();
    status.textContent = 'Loading...';

    const data = await apiGetLeaderboard();
    const { swipeEls, nextAnimIndex } = populateLeaderboardList(list, status, data, 3);

    backBtn.style.setProperty('--swipe-delay', `${nextAnimIndex * 90}ms`);
    const entranceEls: HTMLElement[] = [subtitle, title, status, ...swipeEls, backBtn];
    playLeaderboardEntrance(root, entranceEls);
    playStatsIncomingSound();
  }

  unmount(): void {
    const root = document.getElementById('app-view-leaderboard');
    root?.classList.remove('leaderboard-visible');
    document.getElementById('leaderboard-list')?.replaceChildren();
    const status = document.getElementById('leaderboard-status');
    if (status) status.textContent = 'Loading...';
  }
}
