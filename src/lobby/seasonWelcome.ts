import type { RankProgressionResponse } from '../../shared/api/rank';
import { apiGetRankProgression } from '../auth/rankApi';
import { rankIconUrl } from '../content/rankIcons';

const STORAGE_PREFIX = 'fps_season_welcome_seen_v1';

function storageKey(userId: string, seasonId: string): string {
  return `${STORAGE_PREFIX}:${userId}:${seasonId}`;
}

function hasSeenWelcome(userId: string, seasonId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId, seasonId)) === '1';
  } catch {
    return false;
  }
}

function markWelcomeSeen(userId: string, seasonId: string): void {
  try {
    localStorage.setItem(storageKey(userId, seasonId), '1');
  } catch {
    // ignore quota / private mode
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SeasonWelcomeOptions {
  userId: string;
  onViewSeason: () => void;
}

/**
 * First-lobby welcome for the active season (once per user + season).
 */
export async function maybeShowSeasonWelcomeModal(
  options: SeasonWelcomeOptions,
): Promise<boolean> {
  if (document.querySelector('.match-xp-overlay')) return false;

  let data: RankProgressionResponse;
  try {
    data = await apiGetRankProgression();
  } catch (error) {
    console.warn('[Lobby] Could not load season welcome data', error);
    return false;
  }

  if (hasSeenWelcome(options.userId, data.season.id)) return false;

  openSeasonWelcomeModal(data, options);
  return true;
}

function openSeasonWelcomeModal(
  data: RankProgressionResponse,
  options: SeasonWelcomeOptions,
): void {
  const existing = document.getElementById('season-welcome-modal');
  existing?.remove();

  const root = document.createElement('div');
  root.id = 'season-welcome-modal';
  root.className = 'season-welcome-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'season-welcome-title');

  const seasonName = data.season.name.trim() || 'Season 01';
  const rankName = data.rank.name;
  const iconSrc = rankIconUrl(data.rank.tier, data.rank.division);

  root.innerHTML = `
    <div class="season-welcome-backdrop" data-season-welcome-continue aria-hidden="true"></div>
    <aside class="season-welcome-panel hud-panel" role="document">
      <p class="season-welcome-eyebrow">NEW OPERATOR</p>
      <h2 id="season-welcome-title" class="season-welcome-title">
        WELCOME TO ${escapeHtml(seasonName.toUpperCase())}
      </h2>
      <p class="season-welcome-body">
        Progress your way by playing, earn minerals and unlock new rewards!
      </p>
      <div class="season-welcome-rank">
        <img
          class="season-welcome-rank-icon"
          src="${escapeHtml(iconSrc)}"
          alt="${escapeHtml(rankName)}"
        />
        <div class="season-welcome-rank-meta">
          <span class="season-welcome-rank-label">YOUR RANK</span>
          <span class="season-welcome-rank-name">${escapeHtml(rankName.toUpperCase())}</span>
        </div>
      </div>
      <div class="season-welcome-actions">
        <button type="button" class="armory-btn" data-season-welcome-continue>
          CONTINUE
        </button>
        <button type="button" class="armory-btn armory-btn--primary" data-season-welcome-ranked>
          VIEW SEASON
        </button>
      </div>
    </aside>
  `;

  const dismiss = (goRanked: boolean): void => {
    markWelcomeSeen(options.userId, data.season.id);
    root.classList.remove('season-welcome-visible');
    window.setTimeout(() => root.remove(), 220);
    if (goRanked) options.onViewSeason();
  };

  for (const el of root.querySelectorAll('[data-season-welcome-continue]')) {
    el.addEventListener('click', () => dismiss(false));
  }
  root
    .querySelector('[data-season-welcome-ranked]')
    ?.addEventListener('click', () => dismiss(true));

  document.body.appendChild(root);
  requestAnimationFrame(() => {
    root.classList.add('season-welcome-visible');
  });
}
