import { playStatsIncomingSound } from '../audio/StatsIncomingSound';
import type { PendingMatchXpPayload } from './pendingMatchRewards';
import { clearPendingMatchXp, markMatchXpSeen } from './pendingMatchRewards';

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toLocaleString()}`;
  return value.toLocaleString();
}

function outcomeLabel(payload: PendingMatchXpPayload): string {
  if (payload.tied) return 'DRAW';
  return payload.won ? 'VICTORY' : 'DEFEAT';
}

/**
 * Lobby modal shown after returning from a match with XP / RP awards.
 */
export class MatchXpResultsModal {
  private root: HTMLElement | null = null;
  private onClosed: (() => void) | null = null;

  setClosedHandler(handler: (() => void) | null): void {
    this.onClosed = handler;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(payload: PendingMatchXpPayload): void {
    this.dispose();

    const root = document.createElement('div');
    root.className = 'match-xp-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Match XP results');

    const panel = document.createElement('aside');
    panel.className = 'match-xp-panel hud-panel';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'match-xp-eyebrow match-xp-swipe';
    eyebrow.textContent = 'MATCH COMPLETE';

    const title = document.createElement('h2');
    title.className = 'match-xp-title match-xp-swipe';
    title.textContent = outcomeLabel(payload);
    title.dataset.result = payload.tied ? 'draw' : payload.won ? 'victory' : 'defeat';

    const total = document.createElement('div');
    total.className = 'match-xp-total match-xp-swipe';
    total.innerHTML = `
      <span class="match-xp-total-label">ACCOUNT XP</span>
      <span class="match-xp-total-value">${formatSigned(payload.rewards.totalXp)}</span>
    `;

    const meta = document.createElement('div');
    meta.className = 'match-xp-meta match-xp-swipe';
    const rpClass =
      payload.rewards.rpDelta > 0
        ? 'is-gain'
        : payload.rewards.rpDelta < 0
          ? 'is-loss'
          : '';
    meta.innerHTML = `
      <div class="match-xp-meta-item">
        <span>Season XP</span>
        <strong>${formatSigned(payload.rewards.seasonXp)}</strong>
      </div>
      <div class="match-xp-meta-item">
        <span>Rank Points</span>
        <strong class="${rpClass}">${formatSigned(payload.rewards.rpDelta)} RP</strong>
      </div>
      <div class="match-xp-meta-item">
        <span>Minerals</span>
        <strong class="is-gain">${formatSigned(payload.rewards.mineralsGained ?? 0)}</strong>
      </div>
      ${
        payload.wasMvp
          ? '<div class="match-xp-meta-item match-xp-mvp"><span>MVP</span><strong>AWARDED</strong></div>'
          : ''
      }
    `;

    const body = document.createElement('div');
    body.className = 'match-xp-body match-xp-swipe';

    const perf = payload.performance;
    const accuracyPct = Math.round((payload.rewards.accuracy01 || 0) * 100);
    const statsRow = document.createElement('div');
    statsRow.className = 'match-xp-stats';
    statsRow.innerHTML = `
      <div><span>Kills</span><strong>${perf.kills}</strong></div>
      <div><span>Deaths</span><strong>${perf.deaths}</strong></div>
      <div><span>Damage</span><strong>${Math.round(perf.damageDealt).toLocaleString()}</strong></div>
      <div><span>Accuracy</span><strong>${accuracyPct}%</strong></div>
    `;
    body.appendChild(statsRow);

    if (!payload.summaryOnly) {
      const breakdownTitle = document.createElement('p');
      breakdownTitle.className = 'match-xp-section-label';
      breakdownTitle.textContent = 'XP BREAKDOWN';
      body.appendChild(breakdownTitle);

      const list = document.createElement('ul');
      list.className = 'match-xp-breakdown';
      const rows: Array<{ label: string; value: number }> = [
        { label: 'Participation', value: payload.rewards.baseXp },
        { label: 'Kills', value: payload.rewards.killXp },
        { label: 'Deaths', value: payload.rewards.deathXp },
        { label: 'Damage dealt', value: payload.rewards.damageXp },
        { label: 'Headshot damage', value: payload.rewards.headshotXp },
        { label: 'Accuracy', value: payload.rewards.accuracyXp },
        { label: 'K/D bonus', value: payload.rewards.kdXp },
        { label: 'Match outcome', value: payload.rewards.outcomeXp },
        { label: 'MVP bonus', value: payload.rewards.mvpXp },
      ];
      for (const row of rows) {
        if (row.value === 0 && row.label !== 'Participation') continue;
        const li = document.createElement('li');
        const valueClass = row.value > 0 ? 'is-gain' : row.value < 0 ? 'is-loss' : '';
        li.innerHTML = `<span>${row.label}</span><strong class="${valueClass}">${formatSigned(row.value)}</strong>`;
        list.appendChild(li);
      }
      body.appendChild(list);
    } else {
      const note = document.createElement('p');
      note.className = 'match-xp-note';
      note.textContent =
        'Detailed breakdown unavailable for this session. Totals were saved from the match server.';
      body.appendChild(note);
    }

    if (payload.account || payload.rank) {
      const progress = document.createElement('div');
      progress.className = 'match-xp-progress';
      if (payload.account) {
        progress.innerHTML += `
          <div class="match-xp-progress-row">
            <span>Account level ${payload.account.level}</span>
            <span>${payload.account.xpIntoLevel.toLocaleString()} / ${payload.account.xpForNextLevel.toLocaleString()} XP</span>
          </div>
        `;
      }
      if (payload.rank) {
        progress.innerHTML += `
          <div class="match-xp-progress-row">
            <span>${payload.rank.name}</span>
            <span>${payload.rank.rp.toLocaleString()} RP</span>
          </div>
        `;
      }
      body.appendChild(progress);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'match-xp-close lobby-top-back-btn match-xp-swipe';
    closeBtn.textContent = 'CONTINUE';
    closeBtn.addEventListener('click', () => this.close(payload.matchId));

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') this.close(payload.matchId);
    };
    root.addEventListener('click', (event) => {
      if (event.target === root) this.close(payload.matchId);
    });

    panel.append(eyebrow, title, total, meta, body, closeBtn);
    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;
    window.addEventListener('keydown', onKey);
    (root as HTMLElement & { _onKey?: (e: KeyboardEvent) => void })._onKey = onKey;

    // Entrance
    void root.offsetWidth;
    root.classList.add('match-xp-visible');
    playStatsIncomingSound();
  }

  close(matchId?: string): void {
    if (matchId) {
      markMatchXpSeen(matchId);
      clearPendingMatchXp();
    }
    this.dispose();
    this.onClosed?.();
  }

  dispose(): void {
    if (!this.root) return;
    const onKey = (this.root as HTMLElement & { _onKey?: (e: KeyboardEvent) => void })._onKey;
    if (onKey) window.removeEventListener('keydown', onKey);
    this.root.remove();
    this.root = null;
  }
}
