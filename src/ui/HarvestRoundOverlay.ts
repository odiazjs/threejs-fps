import { isPlasmaHarvestGameMode } from '../../shared/combat/match';
import {
  HARVEST_TEAM_VIVID_COLORS,
  TEAM_BADGE_ICON_SRC,
  TEAM_NAMES,
} from '../../shared/combat/teams';
import type { MatchSnapshot } from '../network/types';

/** Full-screen ROUND WON / ROUND LOST banner during Plasma Harvest `round_end`. */
export class HarvestRoundOverlay {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly scoresEl: HTMLElement;
  private lastKey = '';

  constructor() {
    this.root = document.getElementById('harvest-round-overlay')!;
    this.titleEl = this.root.querySelector('.harvest-round-title')!;
    let scoresEl = this.root.querySelector(
      '.harvest-round-scores',
    ) as HTMLElement | null;
    if (!scoresEl) {
      // Migrate older markup that used a plain text score node.
      const legacy = this.root.querySelector('.harvest-round-score');
      scoresEl = document.createElement('div');
      scoresEl.className = 'harvest-round-scores';
      legacy?.replaceWith(scoresEl);
      if (!legacy) {
        this.root.querySelector('.harvest-round-panel')?.appendChild(scoresEl);
      }
    }
    this.scoresEl = scoresEl;
    this.root.querySelector('.harvest-round-subtitle')?.remove();
  }

  update(match: MatchSnapshot | null, localTeamId = -1): void {
    if (
      !match ||
      !isPlasmaHarvestGameMode(match.gameMode) ||
      match.phase !== 'round_end'
    ) {
      this.root.hidden = true;
      this.lastKey = '';
      return;
    }

    const winner = match.lastRoundWinnerTeamId;
    const localWon = localTeamId >= 0 && localTeamId === winner;
    const key = `${match.currentRound}:${winner}:${localTeamId}:${match.teamScores.join(',')}`;
    if (key === this.lastKey) {
      this.root.hidden = false;
      return;
    }
    this.lastKey = key;

    this.titleEl.textContent = localWon ? 'ROUND WON' : 'ROUND LOST';
    this.titleEl.dataset.result = localWon ? 'won' : 'lost';

    this.scoresEl.replaceChildren();
    for (let teamId = 0; teamId < match.teamCount; teamId++) {
      if (teamId > 0) {
        const sep = document.createElement('span');
        sep.className = 'harvest-round-score-sep';
        sep.textContent = '—';
        this.scoresEl.appendChild(sep);
      }

      const entry = document.createElement('div');
      entry.className = 'harvest-round-score-entry';
      if (teamId === winner) {
        entry.classList.add('is-winner');
      }

      const color =
        HARVEST_TEAM_VIVID_COLORS[
          teamId % HARVEST_TEAM_VIVID_COLORS.length
        ] ?? HARVEST_TEAM_VIVID_COLORS[0]!;
      const name =
        TEAM_NAMES[teamId % TEAM_NAMES.length] ?? `Team ${teamId + 1}`;
      const badgeSrc =
        TEAM_BADGE_ICON_SRC[teamId % TEAM_BADGE_ICON_SRC.length] ??
        TEAM_BADGE_ICON_SRC[0]!;

      const badge = document.createElement('img');
      badge.className = 'harvest-round-score-badge';
      badge.src = badgeSrc;
      badge.alt = `${name} team`;
      badge.draggable = false;

      const points = document.createElement('span');
      points.className = 'harvest-round-score-points';
      points.style.color = color;
      points.textContent = String(match.teamScores[teamId] ?? 0);

      entry.append(badge, points);
      this.scoresEl.appendChild(entry);
    }

    this.root.hidden = false;
  }
}
