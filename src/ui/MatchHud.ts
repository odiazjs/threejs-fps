import {
  formatMatchTimer,
  getMatchTimeRemaining,
  isCompetitiveGameMode,
  isKillRaceGameMode,
  isPlasmaHarvestGameMode,
  teamScoreToKills,
  type MatchPhase,
} from '../../shared/combat/match';
import {
  HARVEST_TEAM_VIVID_COLORS,
  TEAM_BADGE_ICON_SRC,
  TEAM_COLORS,
  TEAM_NAMES,
} from '../../shared/combat/teams';
import type { MatchSnapshot } from '../network/types';
import {
  formatPlasmaMinerals,
  PLASMA_MINERALS_ICON_SRC,
} from './plasmaMineralsHud';

export class MatchHud {
  private readonly root: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly scoresEl: HTMLElement;
  private readonly localRoot: HTMLElement;
  private readonly localTeamEl: HTMLElement;
  private readonly localTeamImg: HTMLImageElement;
  private readonly mineralsEl: HTMLElement;
  private readonly mineralsValueEl: HTMLElement;

  // Persistent DOM + last-rendered values so the per-frame update only
  // mutates text nodes when something actually changed (GC/layout friendly).
  private readonly scoreEls: HTMLElement[] = [];
  private readonly scoreEntries: HTMLElement[] = [];
  private readonly lastScores: number[] = [];
  private builtTeamCount = -1;
  private lastTimerText = '';
  private lastScoreMode: 'points' | 'kills' | 'rounds' | null = null;
  private lastLocalTeamId = -1;
  private lastMineralsText = '';
  private lastMineralsVisible: boolean | null = null;

  constructor() {
    this.root = document.getElementById('match-hud')!;
    this.timerEl = this.root.querySelector('.match-hud-timer')!;
    this.scoresEl = this.root.querySelector('.match-hud-scores')!;

    let localRoot = this.root.querySelector('.match-hud-local') as HTMLElement | null;
    let localTeamEl = this.root.querySelector(
      '.match-hud-local-team',
    ) as HTMLElement | null;

    if (!localRoot) {
      localRoot = document.createElement('div');
      localRoot.className = 'match-hud-local';
      localRoot.hidden = true;
      if (localTeamEl) {
        localTeamEl.replaceWith(localRoot);
        localRoot.appendChild(localTeamEl);
      } else {
        localTeamEl = document.createElement('div');
        localTeamEl.className = 'match-hud-local-team';
        localRoot.appendChild(localTeamEl);
        this.root.appendChild(localRoot);
      }
    }
    if (!localTeamEl) {
      localTeamEl = document.createElement('div');
      localTeamEl.className = 'match-hud-local-team';
      localRoot.prepend(localTeamEl);
    }
    this.localRoot = localRoot;
    this.localTeamEl = localTeamEl;

    let localTeamImg = this.localTeamEl.querySelector(
      '.match-hud-local-team-badge',
    ) as HTMLImageElement | null;
    if (!localTeamImg) {
      localTeamImg = document.createElement('img');
      localTeamImg.className = 'match-hud-local-team-badge';
      localTeamImg.alt = '';
      localTeamImg.draggable = false;
      this.localTeamEl.replaceChildren(localTeamImg);
    }
    this.localTeamImg = localTeamImg;

    let mineralsEl = this.localRoot.querySelector(
      '.match-hud-local-minerals',
    ) as HTMLElement | null;
    if (!mineralsEl) {
      mineralsEl = document.createElement('div');
      mineralsEl.className = 'match-hud-local-minerals';
      mineralsEl.hidden = true;
      const icon = document.createElement('img');
      icon.className = 'match-hud-local-minerals-icon';
      icon.src = PLASMA_MINERALS_ICON_SRC;
      icon.alt = '';
      icon.draggable = false;
      const value = document.createElement('span');
      value.className = 'match-hud-local-minerals-value';
      value.textContent = '0';
      mineralsEl.append(icon, value);
      this.localRoot.appendChild(mineralsEl);
    }
    this.mineralsEl = mineralsEl;
    this.mineralsValueEl = this.mineralsEl.querySelector(
      '.match-hud-local-minerals-value',
    )!;
    const mineralsIcon = this.mineralsEl.querySelector(
      '.match-hud-local-minerals-icon',
    ) as HTMLImageElement | null;
    if (mineralsIcon && !mineralsIcon.getAttribute('src')) {
      mineralsIcon.src = PLASMA_MINERALS_ICON_SRC;
    }
  }

  /**
   * @param hudActive Player is in-game (pointer-locked / not paused).
   * @param localTeamId Local player's team for the "your team" badge.
   * @param matchPlasmaMinerals Local player's in-match mineral balance (Plasma Harvest).
   */
  update(
    match: MatchSnapshot | null,
    worldTime: number,
    hudActive: boolean,
    localTeamId = -1,
    matchPlasmaMinerals = 0,
  ): void {
    if (
      !hudActive ||
      !match ||
      !isCompetitiveGameMode(match.gameMode) ||
      match.phase === 'ended' ||
      match.phase === 'round_end'
    ) {
      this.root.hidden = true;
      return;
    }

    const killRace = isKillRaceGameMode(match.gameMode);
    const plasmaHarvest = isPlasmaHarvestGameMode(match.gameMode);
    const timerText = plasmaHarvest
      ? `ROUND ${Math.max(1, match.currentRound)}`
      : killRace
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
    const scoreMode = plasmaHarvest ? 'rounds' : killRace ? 'kills' : 'points';
    if (teamCount !== this.builtTeamCount || scoreMode !== this.lastScoreMode) {
      this.rebuildScoreRow(teamCount);
      this.lastScoreMode = scoreMode;
      this.lastLocalTeamId = -1;
    }

    for (let teamId = 0; teamId < teamCount; teamId++) {
      const raw = match.teamScores[teamId] ?? 0;
      const score = killRace ? teamScoreToKills(raw) : raw;
      if (score !== this.lastScores[teamId]) {
        this.lastScores[teamId] = score;
        this.scoreEls[teamId]!.textContent = String(score);
      }
    }

    if (localTeamId !== this.lastLocalTeamId) {
      this.lastLocalTeamId = localTeamId;
      this.updateLocalTeamBadge(localTeamId, teamCount);
    }

    this.updateLocalMinerals(plasmaHarvest, matchPlasmaMinerals);

    this.root.hidden = false;
  }

  private updateLocalMinerals(visible: boolean, amount: number): void {
    if (visible !== this.lastMineralsVisible) {
      this.lastMineralsVisible = visible;
      this.mineralsEl.hidden = !visible;
    }
    if (!visible) return;

    const text = formatPlasmaMinerals(amount);
    if (text !== this.lastMineralsText) {
      this.lastMineralsText = text;
      this.mineralsValueEl.textContent = text;
    }
  }

  private updateLocalTeamBadge(localTeamId: number, teamCount: number): void {
    const valid =
      Number.isInteger(localTeamId) &&
      localTeamId >= 0 &&
      localTeamId < teamCount;
    if (!valid) {
      this.localRoot.hidden = true;
      this.localTeamImg.removeAttribute('src');
      this.localTeamEl.classList.remove(
        'match-hud-local-team-blue',
        'match-hud-local-team-orange',
      );
      for (const entry of this.scoreEntries) {
        entry.classList.remove('match-hud-score-local');
      }
      return;
    }

    const vivid =
      HARVEST_TEAM_VIVID_COLORS[
        localTeamId % HARVEST_TEAM_VIVID_COLORS.length
      ] ?? HARVEST_TEAM_VIVID_COLORS[0]!;
    const badgeSrc =
      TEAM_BADGE_ICON_SRC[localTeamId % TEAM_BADGE_ICON_SRC.length] ??
      TEAM_BADGE_ICON_SRC[0]!;
    const name =
      TEAM_NAMES[localTeamId % TEAM_NAMES.length] ?? `Team ${localTeamId + 1}`;

    this.localRoot.hidden = false;
    this.localTeamEl.style.setProperty('--match-team-glow', vivid);
    this.localTeamEl.classList.toggle(
      'match-hud-local-team-blue',
      localTeamId === 0,
    );
    this.localTeamEl.classList.toggle(
      'match-hud-local-team-orange',
      localTeamId === 1,
    );
    this.localTeamImg.src = badgeSrc;
    this.localTeamImg.alt = `${name} team`;

    for (let i = 0; i < this.scoreEntries.length; i++) {
      this.scoreEntries[i]!.classList.toggle(
        'match-hud-score-local',
        i === localTeamId,
      );
    }
  }

  private rebuildScoreRow(teamCount: number): void {
    this.builtTeamCount = teamCount;
    this.scoreEls.length = 0;
    this.scoreEntries.length = 0;
    this.lastScores.length = 0;
    this.scoresEl.replaceChildren();

    for (let teamId = 0; teamId < teamCount; teamId++) {
      const entry = document.createElement('div');
      entry.className = 'match-hud-score';

      const teamEl = document.createElement('span');
      teamEl.className = 'match-hud-team';
      teamEl.style.color =
        TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
      teamEl.textContent =
        TEAM_NAMES[teamId % TEAM_NAMES.length] ?? `Team ${teamId + 1}`;
      entry.appendChild(teamEl);

      const pointsEl = document.createElement('span');
      pointsEl.className = 'match-hud-points';
      entry.appendChild(pointsEl);

      this.scoresEl.appendChild(entry);
      this.scoreEntries.push(entry);
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
