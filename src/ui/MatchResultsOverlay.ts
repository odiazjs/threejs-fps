import { playStatsIncomingSound } from '../audio/StatsIncomingSound';
import { TEAM_COLORS, TEAM_NAMES } from '../../shared/combat/teams';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import type { MatchSnapshot, PlayerSnapshot } from '../network/types';

export interface MatchResultsPlayer {
  sessionId: string;
  username: string;
  teamId: number;
  matchKills: number;
}

export class MatchResultsOverlay {
  private readonly root: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly scoresEl: HTMLElement;
  private readonly leaveButton: HTMLButtonElement;
  private onLeave: (() => void) | null = null;
  private renderedKey: string | null = null;

  constructor() {
    this.root = document.getElementById('match-results-overlay')!;
    this.subtitleEl = this.root.querySelector('.match-results-subtitle')!;
    this.titleEl = this.root.querySelector('.match-results-title')!;
    this.scoresEl = this.root.querySelector('.match-results-scores')!;
    this.leaveButton = this.root.querySelector('.match-results-leave') as HTMLButtonElement;
    this.leaveButton.addEventListener('click', () => this.onLeave?.());
  }

  setLeaveHandler(handler: () => void): void {
    this.onLeave = handler;
  }

  update(
    match: MatchSnapshot | null,
    localTeamId: number,
    players: Array<PlayerSnapshot & { sessionId: string }>,
  ): void {
    if (!match || match.gameMode !== 'tdm' || match.phase !== 'ended') {
      this.root.hidden = true;
      this.renderedKey = null;
      this.root.classList.remove('match-results-visible');
      return;
    }

    const renderKey = `${match.matchEndAt}:${match.winningTeamId}:${players
      .map((player) => `${player.sessionId}:${player.matchKills}`)
      .join(',')}`;

    if (this.renderedKey === renderKey) {
      this.root.hidden = false;
      return;
    }
    this.renderedKey = renderKey;

    const winner = match.winningTeamId;
    if (winner < 0) {
      this.titleEl.textContent = 'DRAW';
      this.titleEl.dataset.result = 'draw';
    } else if (winner === localTeamId) {
      this.titleEl.textContent = 'VICTORY';
      this.titleEl.dataset.result = 'victory';
    } else {
      this.titleEl.textContent = 'DEFEAT';
      this.titleEl.dataset.result = 'defeat';
    }

    this.subtitleEl.classList.add('match-results-swipe');
    this.titleEl.classList.add('match-results-swipe');
    this.subtitleEl.style.setProperty('--swipe-delay', '0ms');
    this.titleEl.style.setProperty('--swipe-delay', '90ms');

    const humans = players
      .filter((player) => !isTrainingBotSessionId(player.sessionId))
      .map(
        (player): MatchResultsPlayer => ({
          sessionId: player.sessionId,
          username: player.username,
          teamId: player.teamId,
          matchKills: player.matchKills ?? 0,
        }),
      );

    this.scoresEl.replaceChildren();
    let animIndex = 2;

    for (let teamId = 0; teamId < match.teamCount; teamId++) {
      const teamBlock = document.createElement('div');
      teamBlock.className = 'match-results-team-block match-results-swipe';
      if (teamId === winner) {
        teamBlock.classList.add('winner');
      }
      teamBlock.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);
      animIndex += 1;

      const color = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
      const name = TEAM_NAMES[teamId % TEAM_NAMES.length] ?? `Team ${teamId + 1}`;
      const score = match.teamScores[teamId] ?? 0;

      const header = document.createElement('div');
      header.className = 'match-results-team-header';

      const nameEl = document.createElement('span');
      nameEl.className = 'match-results-team';
      nameEl.style.color = color;
      nameEl.textContent = name;

      const scoreEl = document.createElement('span');
      scoreEl.className = 'match-results-points';
      scoreEl.textContent = String(score);

      header.append(nameEl, scoreEl);
      teamBlock.appendChild(header);

      const roster = humans
        .filter((player) => player.teamId === teamId)
        .sort((a, b) => b.matchKills - a.matchKills || a.username.localeCompare(b.username));

      const playersEl = document.createElement('div');
      playersEl.className = 'match-results-players';

      if (roster.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'match-results-player match-results-swipe';
        empty.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);
        empty.textContent = 'No players';
        animIndex += 1;
        playersEl.appendChild(empty);
      } else {
        for (const player of roster) {
          const row = document.createElement('div');
          row.className = 'match-results-player match-results-swipe';
          row.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);
          animIndex += 1;

          const playerName = document.createElement('span');
          playerName.className = 'match-results-player-name';
          playerName.textContent = player.username;

          const kills = document.createElement('span');
          kills.className = 'match-results-player-kills';
          kills.textContent = `${player.matchKills} ${player.matchKills === 1 ? 'kill' : 'kills'}`;

          row.append(playerName, kills);
          playersEl.appendChild(row);
        }
      }

      teamBlock.appendChild(playersEl);
      this.scoresEl.appendChild(teamBlock);
    }

    this.leaveButton.classList.add('match-results-swipe');
    this.leaveButton.style.setProperty('--swipe-delay', `${animIndex * 90}ms`);

    this.root.hidden = false;
    this.root.classList.remove('match-results-visible');
    // Restart CSS animations on each fresh results reveal.
    void this.root.offsetWidth;
    this.root.classList.add('match-results-visible');
    playStatsIncomingSound();
  }
}
