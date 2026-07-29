import { getKdRatio } from '../auth/playerSession';
import { rankIconUrl } from '../content/rankIcons';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import type { GameLaunchParticipant } from '../../shared/network/gameInvite';
import type { PlayerSnapshot } from '../network/types';

export type PreMatchLoadStep = 'assets' | 'shaders' | 'sync' | 'finalize';

export interface PreMatchPlayer {
  sessionId: string;
  username: string;
  teamId: number;
  rankLevel: number;
  careerKills: number;
  careerDeaths: number;
  xp: number;
  rankTier: string;
  rankDivision: number;
  rankName: string;
  selectedOperatorId: string;
  clientReady: boolean;
}

const STEP_ORDER: PreMatchLoadStep[] = ['assets', 'shaders', 'sync', 'finalize'];

const TIPS = [
  'Tip: Headshots deal more damage. Aim for the head',
  'Tip: Use cover — peek, shoot, then reposition.',
  'Tip: Shield charges refill mid-fight. Grab them early.',
];

/**
 * Full-screen Blue vs Orange roster shown while the match loads assets/shaders
 * and waits for every participant to be ready (minimum 10s).
 */
export class PreMatchOverlay {
  private readonly root: HTMLElement;
  private readonly blueList: HTMLElement;
  private readonly orangeList: HTMLElement;
  private readonly stepsRoot: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly footerStatus: HTMLElement;
  private readonly tipEl: HTMLElement;
  private lastRenderKey = '';
  private active = false;
  private seededRoster: PreMatchPlayer[] = [];
  private currentStep: PreMatchLoadStep = 'assets';
  private stepProgress = 0;

  constructor() {
    this.root = document.getElementById('pre-match-overlay')!;
    this.blueList = this.root.querySelector('#pre-match-blue-list')!;
    this.orangeList = this.root.querySelector('#pre-match-orange-list')!;
    this.stepsRoot = this.root.querySelector('#pre-match-steps')!;
    this.progressFill = this.root.querySelector('#pre-match-progress-fill')!;
    this.footerStatus = this.root.querySelector('#pre-match-footer-status')!;
    this.tipEl = this.root.querySelector('.pre-match-tip')!;
  }

  show(
    _status = 'PREPARING MATCH…',
    participants: GameLaunchParticipant[] = [],
  ): void {
    this.active = true;
    this.seededRoster = participants.map((participant, index) =>
      this.fromParticipant(participant, index),
    );
    const tipIcon = this.tipEl.querySelector('.pre-match-tip-icon');
    this.tipEl.replaceChildren();
    if (tipIcon) this.tipEl.appendChild(tipIcon);
    this.tipEl.append(
      document.createTextNode(` ${TIPS[Math.floor(Math.random() * TIPS.length)]!}`),
    );
    this.setLoadStep('assets', 0);
    this.setFooterStatus('PREPARING MATCH…');
    this.root.hidden = false;
    this.renderPlayers(this.seededRoster);
    this.hideClickToPlayBlocker();
  }

  hide(): void {
    this.active = false;
    this.root.hidden = true;
    this.lastRenderKey = '';
    this.seededRoster = [];
  }

  isActive(): boolean {
    return this.active;
  }

  /** @deprecated Prefer setLoadStep / setFooterStatus for the new UI. */
  setStatus(message: string, _detail = ''): void {
    this.setFooterStatus(message);
    const lower = message.toLowerCase();
    if (lower.includes('shader')) this.setLoadStep('shaders', 40);
    else if (lower.includes('join') || lower.includes('sync')) this.setLoadStep('sync', 40);
    else if (lower.includes('wait') || lower.includes('final')) this.setLoadStep('finalize', 0);
    else if (lower.includes('asset') || lower.includes('model') || lower.includes('loadout')) {
      this.setLoadStep('assets', 35);
    }
  }

  setLoadStep(step: PreMatchLoadStep, progress = 0): void {
    this.currentStep = step;
    this.stepProgress = Math.max(0, Math.min(100, Math.round(progress)));
    if (!this.active) return;
    this.syncStepsUi();
    this.syncProgressBar();
  }

  completeLoadStep(step: PreMatchLoadStep): void {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < 0) return;
    this.setLoadStep(step, 100);
    const next = STEP_ORDER[idx + 1];
    if (next) this.setLoadStep(next, 0);
  }

  setFooterStatus(message: string): void {
    if (!this.active && !this.root) return;
    const text = message.replace(/\.*$/, '').toUpperCase();
    this.footerStatus.textContent = `>>> ${text} <<<`;
  }

  update(players: Array<PlayerSnapshot & { sessionId: string }>): void {
    if (!this.active) return;
    this.hideClickToPlayBlocker();

    const live = players
      .filter((player) => !isTrainingBotSessionId(player.sessionId))
      .map((player) => this.fromSnapshot(player));

    const roster = this.mergeRoster(live);
    this.renderPlayers(roster);

    if (this.currentStep === 'finalize') {
      const readyCount = roster.filter((player) => player.clientReady).length;
      if (roster.length > 0 && readyCount >= roster.length) {
        this.setLoadStep('finalize', 100);
        this.setFooterStatus('MATCH STARTING SOON…');
      } else {
        this.setFooterStatus('WAITING FOR PLAYERS…');
      }
    }
  }

  private fromParticipant(
    participant: GameLaunchParticipant,
    index: number,
  ): PreMatchPlayer {
    return {
      sessionId: `seed:${participant.userId || index}`,
      username: participant.username,
      teamId: participant.teamId === 1 ? 1 : 0,
      rankLevel: Math.max(1, participant.rankLevel || 1),
      careerKills: Math.max(0, participant.careerKills || 0),
      careerDeaths: Math.max(0, participant.careerDeaths || 0),
      xp: Math.max(0, participant.xp || 0),
      rankTier: participant.rankTier || 'bronze',
      rankDivision: participant.rankDivision === 2 || participant.rankDivision === 3
        ? participant.rankDivision
        : 1,
      rankName: participant.rankName || 'Bronze I',
      selectedOperatorId: participant.selectedOperatorId || 'garla',
      clientReady: false,
    };
  }

  private fromSnapshot(player: PlayerSnapshot & { sessionId: string }): PreMatchPlayer {
    const seeded = this.seededRoster.find(
      (entry) => entry.username.toLowerCase() === player.username.toLowerCase(),
    );
    return {
      sessionId: player.sessionId,
      username: player.username,
      teamId: player.teamId,
      rankLevel: Math.max(1, player.rankLevel ?? seeded?.rankLevel ?? 1),
      careerKills: Math.max(0, player.careerKills ?? seeded?.careerKills ?? 0),
      careerDeaths: Math.max(0, player.careerDeaths ?? seeded?.careerDeaths ?? 0),
      xp: Math.max(0, player.xp ?? seeded?.xp ?? 0),
      rankTier: player.rankTier || seeded?.rankTier || 'bronze',
      rankDivision:
        player.rankDivision === 2 || player.rankDivision === 3
          ? player.rankDivision
          : seeded?.rankDivision || 1,
      rankName: player.rankName || seeded?.rankName || 'Bronze I',
      selectedOperatorId:
        player.selectedOperatorId || seeded?.selectedOperatorId || 'garla',
      clientReady: player.clientReady === true,
    };
  }

  private mergeRoster(live: PreMatchPlayer[]): PreMatchPlayer[] {
    if (live.length === 0) return [...this.seededRoster];

    const byUsername = new Map(
      live.map((player) => [player.username.toLowerCase(), player] as const),
    );
    const merged = [...live];

    for (const seeded of this.seededRoster) {
      if (!byUsername.has(seeded.username.toLowerCase())) {
        merged.push(seeded);
      }
    }

    return merged.sort((a, b) => a.username.localeCompare(b.username));
  }

  private renderPlayers(humans: PreMatchPlayer[]): void {
    const blue = humans.filter((player) => player.teamId === 0);
    const orange = humans.filter((player) => player.teamId !== 0);

    const renderKey = humans
      .map(
        (player) =>
          `${player.sessionId}:${player.teamId}:${player.username}:${player.rankName}:${player.careerKills}:${player.careerDeaths}:${player.xp}:${player.selectedOperatorId}:${player.clientReady ? 1 : 0}`,
      )
      .join('|');

    this.root.hidden = false;
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;

    this.renderTeam(this.blueList, blue);
    this.renderTeam(this.orangeList, orange);
  }

  private renderTeam(listEl: HTMLElement, players: PreMatchPlayer[]): void {
    listEl.replaceChildren();
    if (players.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pre-match-empty';
      empty.textContent = 'Waiting for operatives…';
      listEl.appendChild(empty);
      return;
    }

    for (const player of players) {
      listEl.appendChild(this.createPlayerCard(player));
    }
  }

  private createPlayerCard(player: PreMatchPlayer): HTMLElement {
    const card = document.createElement('article');
    card.className = 'pre-match-player';
    if (player.clientReady) card.classList.add('is-ready');

    const rankIcon = document.createElement('img');
    rankIcon.className = 'pre-match-player-rank-icon';
    rankIcon.alt = player.rankName;
    rankIcon.loading = 'lazy';
    rankIcon.src = rankIconUrl(player.rankTier, player.rankDivision);
    rankIcon.onerror = () => {
      rankIcon.onerror = null;
      rankIcon.src = rankIconUrl('bronze', 1);
    };

    const identity = document.createElement('div');
    identity.className = 'pre-match-player-identity';

    const name = document.createElement('h3');
    name.className = 'pre-match-player-name';
    name.textContent = player.username;

    const rankLabel = document.createElement('p');
    rankLabel.className = 'pre-match-player-rank';
    rankLabel.textContent = player.rankName.toUpperCase();

    identity.append(name, rankLabel);

    const stats = document.createElement('div');
    stats.className = 'pre-match-player-stats';

    const kills = document.createElement('div');
    kills.className = 'pre-match-stat';
    kills.innerHTML = `<span class="pre-match-stat-label">TOTAL KILLS</span><span class="pre-match-stat-value">${player.careerKills.toLocaleString('en-US')}</span>`;

    const kd = document.createElement('div');
    kd.className = 'pre-match-stat';
    kd.innerHTML = `<span class="pre-match-stat-label">K/D</span><span class="pre-match-stat-value pre-match-stat-value--accent">${getKdRatio(
      {
        kills: player.careerKills,
        deaths: player.careerDeaths,
      },
    )}</span>`;

    const xp = document.createElement('div');
    xp.className = 'pre-match-stat';
    xp.innerHTML = `<span class="pre-match-stat-label">XP</span><span class="pre-match-stat-value">${player.xp.toLocaleString('en-US')}</span>`;

    stats.append(kills, kd, xp);
    card.append(rankIcon, identity, stats);
    return card;
  }

  private syncStepsUi(): void {
    const currentIdx = STEP_ORDER.indexOf(this.currentStep);
    for (const step of STEP_ORDER) {
      const el = this.stepsRoot.querySelector<HTMLElement>(`[data-step="${step}"]`);
      if (!el) continue;
      const idx = STEP_ORDER.indexOf(step);
      const meta = el.querySelector('.pre-match-step-meta');
      el.classList.toggle('is-done', idx < currentIdx || (idx === currentIdx && this.stepProgress >= 100));
      el.classList.toggle(
        'is-active',
        idx === currentIdx && this.stepProgress < 100,
      );
      if (!meta) continue;
      if (step === 'finalize') {
        meta.textContent = el.classList.contains('is-done') ? 'OK' : '';
      } else if (idx < currentIdx) {
        meta.textContent = '100%';
      } else if (idx === currentIdx) {
        meta.textContent = `${this.stepProgress}%`;
      } else {
        meta.textContent = '0%';
      }
    }
  }

  private syncProgressBar(): void {
    const currentIdx = STEP_ORDER.indexOf(this.currentStep);
    const base = (currentIdx / STEP_ORDER.length) * 100;
    const slice = (1 / STEP_ORDER.length) * this.stepProgress;
    const total = Math.max(4, Math.min(100, Math.round(base + slice)));
    this.progressFill.style.width = `${total}%`;
  }

  private hideClickToPlayBlocker(): void {
    const blocker = document.getElementById('blocker');
    if (!blocker) return;
    blocker.hidden = true;
    blocker.style.display = 'none';
  }
}
