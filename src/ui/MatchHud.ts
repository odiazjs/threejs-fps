import {
  formatMatchTimer,
  getMatchTimeRemaining,
  type MatchPhase,
} from '../../shared/combat/match';
import { TEAM_COLORS, TEAM_NAMES } from '../../shared/combat/teams';
import type { MatchSnapshot } from '../network/types';

export class MatchHud {
  private readonly root: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly scoresEl: HTMLElement;

  constructor() {
    this.root = document.getElementById('match-hud')!;
    this.timerEl = this.root.querySelector('.match-hud-timer')!;
    this.scoresEl = this.root.querySelector('.match-hud-scores')!;
  }

  /**
   * @param hudActive Player is in-game (pointer-locked / not paused).
   */
  update(match: MatchSnapshot | null, worldTime: number, hudActive: boolean): void {
    if (!hudActive || !match || match.gameMode !== 'tdm' || match.phase === 'ended') {
      this.root.hidden = true;
      return;
    }

    const remaining = getMatchTimeRemaining(
      match.phase as MatchPhase,
      worldTime,
      match.matchStartAt,
      match.matchEndAt,
      match.matchDurationSec,
    );
    this.timerEl.textContent = formatMatchTimer(remaining);

    this.scoresEl.replaceChildren();
    const teamCount = Math.max(1, match.teamCount);
    for (let teamId = 0; teamId < teamCount; teamId++) {
      const entry = document.createElement('div');
      entry.className = 'match-hud-score';
      const color = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
      const name = TEAM_NAMES[teamId % TEAM_NAMES.length] ?? `Team ${teamId + 1}`;
      const score = match.teamScores[teamId] ?? 0;
      entry.innerHTML = `<span class="match-hud-team" style="color:${color}">${name}</span><span class="match-hud-points">${score}</span>`;
      this.scoresEl.appendChild(entry);

      if (teamId < teamCount - 1) {
        const sep = document.createElement('span');
        sep.className = 'match-hud-separator';
        sep.textContent = '—';
        this.scoresEl.appendChild(sep);
      }
    }

    this.root.hidden = false;
  }
}

export function resolveMatchSnapshot(
  server: MatchSnapshot | null | undefined,
): MatchSnapshot | null {
  if (server?.gameMode === 'tdm') return server;
  return null;
}
