import {
  formatMatchTimer,
  getMatchTimeRemaining,
  isCompetitiveGameMode,
  isKillRaceGameMode,
  teamScoreToKills,
  type MatchPhase,
} from '../../shared/combat/match';
import { TEAM_COLORS, TEAM_NAMES } from '../../shared/combat/teams';
import type { MatchSnapshot } from '../network/types';

export class MatchHud {
  private readonly root: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly scoresEl: HTMLElement;

  // Persistent DOM + last-rendered values so the per-frame update only
  // mutates text nodes when something actually changed (GC/layout friendly).
  private readonly scoreEls: HTMLElement[] = [];
  private readonly lastScores: number[] = [];
  private builtTeamCount = -1;
  private lastTimerText = '';
  private lastScoreMode: 'points' | 'kills' | null = null;

  constructor() {
    this.root = document.getElementById('match-hud')!;
    this.timerEl = this.root.querySelector('.match-hud-timer')!;
    this.scoresEl = this.root.querySelector('.match-hud-scores')!;
  }

  /**
   * @param hudActive Player is in-game (pointer-locked / not paused).
   */
  update(match: MatchSnapshot | null, worldTime: number, hudActive: boolean): void {
    if (!hudActive || !match || !isCompetitiveGameMode(match.gameMode) || match.phase === 'ended') {
      this.root.hidden = true;
      return;
    }

    const killRace = isKillRaceGameMode(match.gameMode);
    const timerText = killRace
      ? match.killLimit > 0
        ? `FIRST TO ${match.killLimit}`
        : 'FIRST TO KILLS'
      : formatMatchTimer(
          getMatchTimeRemaining(
            match.phase as MatchPhase,
            worldTime,
            match.matchStartAt,
            match.matchEndAt,
            match.matchDurationSec,
          ),
        );
    if (timerText !== this.lastTimerText) {
      this.lastTimerText = timerText;
      this.timerEl.textContent = timerText;
    }

    const teamCount = Math.max(1, match.teamCount);
    const scoreMode = killRace ? 'kills' : 'points';
    if (teamCount !== this.builtTeamCount || scoreMode !== this.lastScoreMode) {
      this.rebuildScoreRow(teamCount);
      this.lastScoreMode = scoreMode;
    }

    for (let teamId = 0; teamId < teamCount; teamId++) {
      const raw = match.teamScores[teamId] ?? 0;
      const score = killRace ? teamScoreToKills(raw) : raw;
      if (score !== this.lastScores[teamId]) {
        this.lastScores[teamId] = score;
        this.scoreEls[teamId]!.textContent = String(score);
      }
    }

    this.root.hidden = false;
  }

  private rebuildScoreRow(teamCount: number): void {
    this.builtTeamCount = teamCount;
    this.scoreEls.length = 0;
    this.lastScores.length = 0;
    this.scoresEl.replaceChildren();

    for (let teamId = 0; teamId < teamCount; teamId++) {
      const entry = document.createElement('div');
      entry.className = 'match-hud-score';

      const teamEl = document.createElement('span');
      teamEl.className = 'match-hud-team';
      teamEl.style.color = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
      teamEl.textContent = TEAM_NAMES[teamId % TEAM_NAMES.length] ?? `Team ${teamId + 1}`;
      entry.appendChild(teamEl);

      const pointsEl = document.createElement('span');
      pointsEl.className = 'match-hud-points';
      entry.appendChild(pointsEl);

      this.scoresEl.appendChild(entry);
      this.scoreEls.push(pointsEl);
      this.lastScores.push(-1);

      if (teamId < teamCount - 1) {
        const sep = document.createElement('span');
        sep.className = 'match-hud-separator';
        sep.textContent = '—';
        this.scoresEl.appendChild(sep);
      }
    }
  }
}

export function resolveMatchSnapshot(
  server: MatchSnapshot | null | undefined,
): MatchSnapshot | null {
  if (server && isCompetitiveGameMode(server.gameMode)) return server;
  return null;
}
