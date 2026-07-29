import {
  getCountdownDisplayValue,
  getMatchObjectiveBanner,
  isCompetitiveGameMode,
} from '../../shared/combat/match';
import type { MatchSnapshot } from '../network/types';

export class MatchCountdownOverlay {
  private readonly root: HTMLElement;
  private readonly valueEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly objectiveEl: HTMLElement;

  constructor() {
    this.root = document.getElementById('match-countdown-overlay')!;
    this.valueEl = this.root.querySelector('.match-countdown-value')!;
    this.subtitleEl = this.root.querySelector('.match-countdown-subtitle')!;
    this.objectiveEl = this.root.querySelector('.match-countdown-objective')!;
  }

  update(match: MatchSnapshot | null, worldTime: number): void {
    if (!match || !isCompetitiveGameMode(match.gameMode) || match.phase !== 'countdown') {
      this.root.hidden = true;
      return;
    }

    const display = getCountdownDisplayValue(worldTime, match.matchCountdownEndAt);
    if (!display) {
      this.root.hidden = true;
      return;
    }

    this.valueEl.textContent = display;
    this.valueEl.classList.toggle('go', display === 'GO');
    this.subtitleEl.textContent =
      display === 'GO' ? 'FIGHT' : 'Match starts in';
    this.objectiveEl.textContent = getMatchObjectiveBanner(
      match.gameMode,
      match.matchDurationSec,
      match.killLimit,
    );
    this.root.hidden = false;
  }
}
