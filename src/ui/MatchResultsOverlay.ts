import { TEAM_COLORS, TEAM_NAMES } from '../../shared/combat/teams';
import type { MatchSnapshot } from '../network/types';

export class MatchResultsOverlay {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly scoresEl: HTMLElement;
  private readonly leaveButton: HTMLButtonElement;
  private onLeave: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('match-results-overlay')!;
    this.titleEl = this.root.querySelector('.match-results-title')!;
    this.scoresEl = this.root.querySelector('.match-results-scores')!;
    this.leaveButton = this.root.querySelector('.match-results-leave') as HTMLButtonElement;
    this.leaveButton.addEventListener('click', () => this.onLeave?.());
  }

  setLeaveHandler(handler: () => void): void {
    this.onLeave = handler;
  }

  update(match: MatchSnapshot | null, localTeamId: number): void {
    if (!match || match.gameMode !== 'tdm' || match.phase !== 'ended') {
      this.root.hidden = true;
      return;
    }

    const winner = match.winningTeamId;
    if (winner < 0) {
      this.titleEl.textContent = 'DRAW';
    } else if (winner === localTeamId) {
      this.titleEl.textContent = 'VICTORY';
    } else {
      this.titleEl.textContent = 'DEFEAT';
    }

    this.scoresEl.replaceChildren();
    for (let teamId = 0; teamId < match.teamCount; teamId++) {
      const row = document.createElement('div');
      row.className = 'match-results-row';
      if (teamId === winner) {
        row.classList.add('winner');
      }

      const color = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
      const name = TEAM_NAMES[teamId % TEAM_NAMES.length] ?? `Team ${teamId + 1}`;
      const score = match.teamScores[teamId] ?? 0;

      const nameEl = document.createElement('span');
      nameEl.className = 'match-results-team';
      nameEl.style.color = color;
      nameEl.textContent = name;

      const scoreEl = document.createElement('span');
      scoreEl.className = 'match-results-points';
      scoreEl.textContent = String(score);

      row.append(nameEl, scoreEl);
      this.scoresEl.appendChild(row);
    }

    this.root.hidden = false;
  }
}
