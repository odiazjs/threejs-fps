import { playStatsIncomingSound } from '../../audio/StatsIncomingSound';
import { apiGetLeaderboard } from '../../auth/leaderboardApi';
import { getKdRatio } from '../../auth/playerSession';

function placeAttr(rank: number): string | null {
  if (rank === 1) return 'first';
  if (rank === 2) return 'second';
  if (rank === 3) return 'third';
  return null;
}

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
    list.replaceChildren();

    if (data.players.length === 0) {
      status.textContent = 'No players on the board yet';
      this.playEntrance(root, [subtitle, title, status, backBtn]);
      return;
    }

    status.textContent = `Top ${data.players.length} players by kills`;

    const swipeEls: HTMLElement[] = [subtitle, title, status];
    let animIndex = 3;

    const block = document.createElement('div');
    block.className = 'leaderboard-block leaderboard-swipe';
    block.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);
    animIndex += 1;
    swipeEls.push(block);

    const header = document.createElement('div');
    header.className = 'leaderboard-block-header';

    const headerLabel = document.createElement('span');
    headerLabel.className = 'leaderboard-block-label';
    headerLabel.textContent = 'Players';

    const headerStat = document.createElement('span');
    headerStat.className = 'leaderboard-block-stat';
    headerStat.textContent = 'Kills';

    header.append(headerLabel, headerStat);
    block.appendChild(header);

    const playersEl = document.createElement('div');
    playersEl.className = 'leaderboard-players';

    data.players.forEach((player, index) => {
      const rank = index + 1;
      const row = document.createElement('div');
      row.className = 'leaderboard-player-row leaderboard-swipe';
      row.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);
      animIndex += 1;

      const place = placeAttr(rank);
      if (place) {
        row.dataset.place = place;
      }

      const rankEl = document.createElement('span');
      rankEl.className = 'leaderboard-rank';
      rankEl.textContent = `#${rank}`;

      const info = document.createElement('div');
      info.className = 'leaderboard-player-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'leaderboard-player-name';
      nameEl.textContent = player.displayName;

      const emailEl = document.createElement('span');
      emailEl.className = 'leaderboard-email';
      emailEl.textContent = player.email;

      info.append(nameEl, emailEl);

      const stats = document.createElement('div');
      stats.className = 'leaderboard-player-stats';

      const killsEl = document.createElement('span');
      killsEl.className = 'leaderboard-kills';
      killsEl.textContent = `${player.kills} ${player.kills === 1 ? 'kill' : 'kills'}`;

      const kdEl = document.createElement('span');
      kdEl.className = 'leaderboard-kd';
      kdEl.textContent = `${getKdRatio(player)} K/D`;

      stats.append(killsEl, kdEl);
      row.append(rankEl, info, stats);
      playersEl.appendChild(row);
      swipeEls.push(row);
    });

    block.appendChild(playersEl);
    list.appendChild(block);

    backBtn.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);
    swipeEls.push(backBtn);

    this.playEntrance(root, swipeEls);
  }

  unmount(): void {
    const root = document.getElementById('app-view-leaderboard');
    root?.classList.remove('leaderboard-visible');
    document.getElementById('leaderboard-list')?.replaceChildren();
    const status = document.getElementById('leaderboard-status');
    if (status) status.textContent = 'Loading...';
  }

  private playEntrance(root: HTMLElement, elements: HTMLElement[]): void {
    for (const el of elements) {
      el.classList.add('leaderboard-swipe');
    }

    root.classList.remove('leaderboard-visible');
    void root.offsetWidth;
    root.classList.add('leaderboard-visible');
    playStatsIncomingSound();
  }
}
