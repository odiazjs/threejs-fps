import type { LeaderboardResponse } from '../../shared/api/leaderboard';
import { getKdRatio } from '../auth/playerSession';

function placeAttr(rank: number): string | null {
  if (rank === 1) return 'first';
  if (rank === 2) return 'second';
  if (rank === 3) return 'third';
  return null;
}

export interface LeaderboardPopulateResult {
  readonly swipeEls: HTMLElement[];
  readonly nextAnimIndex: number;
}

/** Build the ranked player list + status text used by full-page and lobby overlay UIs. */
export function populateLeaderboardList(
  list: HTMLElement,
  status: HTMLElement,
  data: LeaderboardResponse,
  swipeStartIndex = 3,
): LeaderboardPopulateResult {
  list.replaceChildren();
  const swipeEls: HTMLElement[] = [];
  let animIndex = swipeStartIndex;

  if (data.players.length === 0) {
    status.textContent = 'No players on the board yet';
    return { swipeEls, nextAnimIndex: animIndex };
  }

  status.textContent = `Top ${data.players.length} players by kills`;

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

  return { swipeEls, nextAnimIndex: animIndex };
}

/** Trigger staggered swipe-in + shared stats entrance cue. */
export function playLeaderboardEntrance(root: HTMLElement, elements: HTMLElement[]): void {
  for (const el of elements) {
    el.classList.add('leaderboard-swipe');
  }

  root.classList.remove('leaderboard-visible');
  void root.offsetWidth;
  root.classList.add('leaderboard-visible');
}
