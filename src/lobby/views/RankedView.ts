import type { RankProgressionResponse, SeasonRewardSnapshot } from '../../../shared/api/rank';
import type { RankDefinition, RankTierId } from '../../../shared/content/ranks';
import { SHARED_CHARACTER_MESH_FILE } from '../../../shared/content/characterMesh';
import { isSeasonRewardModelPreviewable } from '../../../shared/content/seasonRewards';
import { apiClaimSeasonReward, apiGetRankProgression } from '../../auth/rankApi';
import {
  getActiveCharacterId,
  getActiveCharacterMeshFile,
} from '../../content/activeCharacterMesh';
import { getActiveOperatorId } from '../../content/activeOperatorCharacter';
import { formatKd, formatRp, formatWinRate, rankIconUrl } from '../../content/rankIcons';
import { StorePreviewScene } from '../../store/StorePreviewScene';
import { LoadingOverlay } from '../../ui/LoadingOverlay';
import { PLASMA_MINERALS_ICON_SRC } from '../../ui/plasmaMineralsHud';

const TIER_ORDER: RankTierId[] = [
  'bronze',
  'silver',
  'gold',
  'titanium',
  'crystal',
  'magmaster',
];

const TIER_LABEL: Record<RankTierId, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  titanium: 'Titanium',
  crystal: 'Crystal',
  magmaster: 'Magmaster',
};

const INFO_CARDS = [
  {
    title: 'Climb the Ranks',
    body: 'Win matches to earn RP and advance through the ranks.',
  },
  {
    title: 'Improve Your Skill',
    body: 'Face skilled opponents and prove you belong at the top.',
  },
  {
    title: 'Earn Exclusive Rewards',
    body: 'Unlock unique cosmetics, credits and boosters as you progress.',
  },
  {
    title: 'Seasonal Reset',
    body: 'Ranks reset each season. New beginning, new opportunities.',
  },
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function groupLadderByTier(ladder: readonly RankDefinition[]): Map<RankTierId, RankDefinition[]> {
  const map = new Map<RankTierId, RankDefinition[]>();
  for (const tier of TIER_ORDER) map.set(tier, []);
  for (const rank of ladder) {
    const list = map.get(rank.tier as RankTierId);
    if (list) list.push(rank);
  }
  return map;
}

function seasonTrackLevels(
  seasonRewards: RankProgressionResponse['seasonRewards'],
  currentLevel: number,
): number[] {
  if (seasonRewards.length > 0) {
    return [...seasonRewards]
      .sort((a, b) => a.level - b.level)
      .map((reward) => reward.level);
  }
  const maxLevel = Math.max(currentLevel, 40);
  return Array.from({ length: maxLevel }, (_, i) => i + 1);
}

function rewardReceiveDescription(reward: SeasonRewardSnapshot): string {
  if (reward.rewardType === 'credits' || reward.rewardType === 'minerals') {
    return reward.rewardLabel;
  }
  if (reward.rewardType === 'character') {
    return `the operator ${reward.rewardLabel}`;
  }
  if (reward.rewardType === 'character_skin') {
    return `the body skin ${reward.rewardLabel}`;
  }
  return reward.rewardLabel;
}

/** Split currency labels into amount + type for the track card layout. */
function seasonRewardCardLabels(reward: SeasonRewardSnapshot | undefined, level: number): {
  primary: string;
  secondary: string | null;
} {
  if (!reward) {
    return { primary: `Level ${level}`, secondary: null };
  }
  if (reward.rewardType === 'credits') {
    const amount =
      reward.rewardAmount != null
        ? formatRp(reward.rewardAmount)
        : reward.rewardLabel.replace(/\s*credits?\s*$/i, '').trim() || reward.rewardLabel;
    return { primary: amount, secondary: 'CREDITS' };
  }
  if (reward.rewardType === 'minerals') {
    const amount =
      reward.rewardAmount != null
        ? formatRp(reward.rewardAmount)
        : reward.rewardLabel
            .replace(/\s*plasma\s*minerals?\s*$/i, '')
            .replace(/\s*minerals?\s*$/i, '')
            .trim() || reward.rewardLabel;
    return { primary: amount, secondary: 'PLASMA MINERALS' };
  }
  return { primary: reward.rewardLabel, secondary: null };
}

function seasonTrackProgressPct(
  trackLevels: readonly number[],
  seasonLevel: number,
  xpIntoLevel: number,
  xpForNextLevel: number,
): number {
  if (trackLevels.length <= 1) return 100;
  let i = trackLevels.indexOf(seasonLevel);
  if (i < 0) {
    i = trackLevels.reduce(
      (acc, level, idx) => (level <= seasonLevel ? idx : acc),
      0,
    );
  }
  const into = xpForNextLevel > 0 ? Math.min(1, xpIntoLevel / xpForNextLevel) : 1;
  return Math.min(100, ((i + into) / (trackLevels.length - 1)) * 100);
}

export class RankedView {
  private root: HTMLElement | null = null;
  private onRewardsClick: (() => void) | null = null;
  private onTrackClick: ((event: Event) => void) | null = null;
  private onPreviewClose: (() => void) | null = null;
  private onCongratsClose: (() => void) | null = null;
  private progression: RankProgressionResponse | null = null;
  private seasonRewards: readonly SeasonRewardSnapshot[] = [];
  private previewScene: StorePreviewScene | null = null;
  private previewOpen = false;
  private redeemBusy = false;

  async mount(): Promise<void> {
    this.unmount();

    this.root = document.getElementById('app-view-ranked');
    const content = document.getElementById('ranked-content');
    const status = document.getElementById('ranked-status');
    if (!this.root || !content || !status) return;

    this.root.classList.remove('ranked-visible');
    content.replaceChildren();
    status.hidden = false;
    status.textContent = 'Loading rank data...';

    try {
      const data = await apiGetRankProgression();
      this.applyProgression(data);
      status.hidden = true;
      content.innerHTML = this.render(data);
      this.bindInteractions();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.root?.classList.add('ranked-visible');
          document
            .querySelector('.ranked-season-step.is-current')
            ?.scrollIntoView({ inline: 'center', block: 'nearest' });
        });
      });
    } catch (error) {
      status.hidden = false;
      status.textContent =
        error instanceof Error ? error.message : 'Could not load rank progression';
    }
  }

  unmount(): void {
    this.closeRewardPreview();
    this.hideCongrats();
    this.root?.classList.remove('ranked-visible');
    document.getElementById('ranked-content')?.replaceChildren();
    const status = document.getElementById('ranked-status');
    if (status) {
      status.hidden = false;
      status.textContent = 'Loading...';
    }
    this.unbindInteractions();
    this.progression = null;
    this.seasonRewards = [];
    this.redeemBusy = false;
    this.root = null;
  }

  private applyProgression(data: RankProgressionResponse): void {
    this.progression = data;
    this.seasonRewards = data.seasonRewards;
  }

  private unbindInteractions(): void {
    if (this.onRewardsClick) {
      document
        .getElementById('ranked-view-rewards-btn')
        ?.removeEventListener('click', this.onRewardsClick);
      this.onRewardsClick = null;
    }
    if (this.onTrackClick) {
      document
        .getElementById('ranked-content')
        ?.removeEventListener('click', this.onTrackClick);
      this.onTrackClick = null;
    }
    if (this.onPreviewClose) {
      for (const el of document.querySelectorAll('[data-ranked-preview-close]')) {
        el.removeEventListener('click', this.onPreviewClose);
      }
      this.onPreviewClose = null;
    }
    if (this.onCongratsClose) {
      for (const el of document.querySelectorAll('[data-ranked-congrats-close]')) {
        el.removeEventListener('click', this.onCongratsClose);
      }
      this.onCongratsClose = null;
    }
  }

  private bindInteractions(): void {
    const btn = document.getElementById('ranked-view-rewards-btn');
    const season = document.getElementById('ranked-season-section');
    if (btn && season) {
      this.onRewardsClick = () => {
        season.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        season.classList.add('ranked-season--pulse');
        window.setTimeout(() => season.classList.remove('ranked-season--pulse'), 900);
      };
      btn.addEventListener('click', this.onRewardsClick);
    }

    this.onTrackClick = (event) => {
      const target = event.target as HTMLElement;
      const previewBtn = target.closest<HTMLElement>('[data-season-preview-level]');
      if (previewBtn) {
        const level = Number(previewBtn.dataset.seasonPreviewLevel);
        if (Number.isFinite(level)) void this.openRewardPreview(level);
        return;
      }
      const redeemBtn = target.closest<HTMLButtonElement>('[data-season-redeem-level]');
      if (redeemBtn && !redeemBtn.disabled) {
        const level = Number(redeemBtn.dataset.seasonRedeemLevel);
        if (Number.isFinite(level)) void this.redeemReward(level);
      }
    };
    document.getElementById('ranked-content')?.addEventListener('click', this.onTrackClick);

    this.onPreviewClose = () => this.closeRewardPreview();
    for (const el of document.querySelectorAll('[data-ranked-preview-close]')) {
      el.addEventListener('click', this.onPreviewClose);
    }

    this.onCongratsClose = () => this.hideCongrats();
    for (const el of document.querySelectorAll('[data-ranked-congrats-close]')) {
      el.addEventListener('click', this.onCongratsClose);
    }
  }

  private async redeemReward(level: number): Promise<void> {
    if (this.redeemBusy) return;
    const reward = this.seasonRewards.find((entry) => entry.level === level);
    if (!reward || !reward.unlocked || reward.claimed) return;

    this.redeemBusy = true;
    this.setRedeemButtonsBusy(true);
    const loading = LoadingOverlay.shared();
    loading.show('Redeeming reward...');
    try {
      const result = await apiClaimSeasonReward(level);
      this.applyProgression(result.progression);
      const content = document.getElementById('ranked-content');
      if (content && this.progression) {
        this.unbindInteractions();
        content.innerHTML = this.render(this.progression);
        this.bindInteractions();
      }
      this.showCongrats(result.claimed);
    } catch (error) {
      console.warn(
        '[RankedView]',
        error instanceof Error ? error.message : 'Could not redeem season reward',
      );
    } finally {
      loading.hide();
      this.redeemBusy = false;
      this.setRedeemButtonsBusy(false);
    }
  }

  private setRedeemButtonsBusy(busy: boolean): void {
    for (const btn of document.querySelectorAll<HTMLButtonElement>(
      '[data-season-redeem-level]',
    )) {
      const level = Number(btn.dataset.seasonRedeemLevel);
      const reward = this.seasonRewards.find((entry) => entry.level === level);
      if (!reward) continue;
      if (reward.claimed || !reward.unlocked) {
        btn.disabled = true;
        continue;
      }
      btn.disabled = busy;
    }
  }

  private showCongrats(reward: SeasonRewardSnapshot): void {
    const modal = document.getElementById('ranked-reward-congrats-modal');
    const name = document.getElementById('ranked-reward-congrats-name');
    if (name) name.textContent = rewardReceiveDescription(reward);
    if (modal) modal.hidden = false;
  }

  private hideCongrats(): void {
    const modal = document.getElementById('ranked-reward-congrats-modal');
    if (modal) modal.hidden = true;
  }

  private async openRewardPreview(level: number): Promise<void> {
    const reward = this.seasonRewards.find((entry) => entry.level === level);
    if (!reward || !isSeasonRewardModelPreviewable(reward)) return;

    const modal = document.getElementById('ranked-reward-preview-modal');
    const title = document.getElementById('ranked-reward-preview-title');
    const levelLabel = document.getElementById('ranked-reward-preview-level');
    const canvasHost = document.getElementById('ranked-reward-preview-canvas');
    if (!modal || !canvasHost) return;

    if (title) title.textContent = reward.rewardLabel.toUpperCase();
    if (levelLabel) {
      levelLabel.textContent = `SEASON TRACK LEVEL ${reward.level}`;
    }

    this.previewOpen = true;
    modal.hidden = false;

    if (!this.previewScene) {
      this.previewScene = new StorePreviewScene(canvasHost);
    }
    await this.previewScene.whenReady();
    this.previewScene.refreshViewport();

    const itemId = reward.rewardItemId!.trim();
    if (reward.rewardType === 'character') {
      await this.previewScene.showAsset(getActiveCharacterMeshFile(), {
        playShowcaseIdle: true,
        characterId: itemId,
        skinId: getActiveCharacterId(),
        focusFace: false,
      });
    } else {
      await this.previewScene.showAsset(SHARED_CHARACTER_MESH_FILE, {
        playShowcaseIdle: true,
        characterId: getActiveOperatorId(),
        skinId: itemId,
        focusFace: false,
      });
    }

    if (!this.previewOpen) return;
    this.previewScene.refreshViewport();
  }

  private closeRewardPreview(): void {
    this.previewOpen = false;
    const modal = document.getElementById('ranked-reward-preview-modal');
    if (modal) modal.hidden = true;

    if (this.previewScene) {
      void this.previewScene.showAsset(null);
      this.previewScene.dispose();
      this.previewScene = null;
    }
    const canvasHost = document.getElementById('ranked-reward-preview-canvas');
    canvasHost?.replaceChildren();
  }

  private render(data: RankProgressionResponse): string {
    const { account, career, rank, seasonStats, seasonRewards, rankLadder } = data;
    const xpPct = Math.min(
      100,
      account.xpForNextLevel > 0
        ? (account.xpIntoLevel / account.xpForNextLevel) * 100
        : 100,
    );
    const nextRp = rank.next?.minRp ?? rank.rp;
    const rpPct = Math.min(
      100,
      nextRp > rank.minRp
        ? ((rank.rp - rank.minRp) / (nextRp - rank.minRp)) * 100
        : 100,
    );

    const byTier = groupLadderByTier(rankLadder);
    const rewardByLevel = new Map(seasonRewards.map((r) => [r.level, r]));
    const trackLevels = seasonTrackLevels(seasonRewards, seasonStats.seasonLevel);

    return `
      <div class="ranked-layout">
        <section class="ranked-panel ranked-overview hud-panel">
          <header class="ranked-overview-header">
            <div class="ranked-avatar" aria-hidden="true">
              <img
                class="ranked-current-mini-icon"
                src="${rankIconUrl(rank.tier, rank.division)}"
                alt=""
              />
            </div>
            <div class="ranked-overview-identity">
              <p class="ranked-eyebrow">OPERATOR</p>
              <h2 class="ranked-username">${escapeHtml(data.displayName)}</h2>
              <p class="ranked-level-label">LEVEL ${account.level}</p>
              <div class="ranked-current-chip ranked-tier-${escapeHtml(rank.tier)}">
                <img src="${rankIconUrl(rank.tier, rank.division)}" alt="" />
                <span>${escapeHtml(rank.name.toUpperCase())}</span>
              </div>
            </div>
          </header>

          <div class="ranked-bar-block">
            <div class="ranked-bar-meta">
              <span>ACCOUNT XP</span>
              <span>${formatRp(account.xpIntoLevel)} / ${formatRp(account.xpForNextLevel)} XP</span>
            </div>
            <div class="ranked-bar" role="progressbar" aria-valuenow="${Math.round(xpPct)}" aria-valuemin="0" aria-valuemax="100">
              <div class="ranked-bar-fill ranked-bar-fill--xp" style="--bar-pct: ${xpPct}%"></div>
            </div>
          </div>

          <div class="ranked-stat-grid">
            <div class="ranked-stat">
              <span class="ranked-stat-label">Matches Played</span>
              <span class="ranked-stat-value">${career.matchesPlayed}</span>
            </div>
            <div class="ranked-stat">
              <span class="ranked-stat-label">Kills</span>
              <span class="ranked-stat-value">${career.kills}</span>
            </div>
            <div class="ranked-stat">
              <span class="ranked-stat-label">Deaths</span>
              <span class="ranked-stat-value">${career.deaths}</span>
            </div>
            <div class="ranked-stat">
              <span class="ranked-stat-label">K/D Ratio</span>
              <span class="ranked-stat-value">${formatKd(career.kd)}</span>
            </div>
          </div>
        </section>

        <section class="ranked-panel ranked-current hud-panel">
          <p class="ranked-eyebrow">CURRENT RANK</p>
          <div class="ranked-current-badge">
            <img
              src="${rankIconUrl(rank.tier, rank.division)}"
              alt="${escapeHtml(rank.name)}"
            />
          </div>
          <h2 class="ranked-current-name ranked-tier-text-${escapeHtml(rank.tier)}">${escapeHtml(rank.name.toUpperCase())}</h2>

          <div class="ranked-bar-block">
            <div class="ranked-bar-meta">
              <span>RANK POINTS (RP)</span>
              <span>${formatRp(rank.rp)} / ${formatRp(nextRp)}</span>
            </div>
            <div class="ranked-bar ranked-bar--rp" role="progressbar" aria-valuenow="${Math.round(rpPct)}" aria-valuemin="0" aria-valuemax="100">
              <div class="ranked-bar-fill ranked-bar-fill--rp" style="--bar-pct: ${rpPct}%"></div>
            </div>
          </div>

          <p class="ranked-next-line">
            NEXT RANK:
            <strong>${escapeHtml(rank.next?.name.toUpperCase() ?? 'MAX RANK')}</strong>
            <span>${rank.next ? `${formatRp(rank.next.minRp)} RP` : ''}</span>
          </p>

          <button id="ranked-view-rewards-btn" class="ranked-rewards-btn" type="button">
            VIEW REWARDS
          </button>
        </section>

        <section class="ranked-panel ranked-tiers hud-panel" aria-label="Rank tiers">
          <header class="ranked-tiers-header">
            <span>RANK TIERS</span>
          </header>
          <div class="ranked-tiers-list">
            ${TIER_ORDER.map((tier) => {
              const ranks = byTier.get(tier) ?? [];
              if (ranks.length === 0) return '';
              return `
                <div class="ranked-tier-row ranked-tier-${escapeHtml(tier)}">
                  <span class="ranked-tier-name">${TIER_LABEL[tier]}</span>
                  <div class="ranked-tier-badges">
                    ${ranks
                      .map((r) => {
                        const current =
                          r.tier === rank.tier && r.division === rank.division
                            ? ' is-current'
                            : '';
                        return `
                          <div class="ranked-tier-badge${current}" title="${escapeHtml(r.name)}">
                            <img src="${rankIconUrl(r.tier, r.division)}" alt="${escapeHtml(r.name)}" />
                          </div>
                        `;
                      })
                      .join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <section class="ranked-panel ranked-thresholds hud-panel" aria-label="Rank levels and points thresholds">
          <header class="ranked-thresholds-header">
            <span>RANK</span>
            <span>RP THRESHOLD</span>
          </header>
          <div class="ranked-thresholds-list">
            ${rankLadder
              .map((r) => {
                const current =
                  r.tier === rank.tier && r.division === rank.division
                    ? ' is-current'
                    : '';
                return `
                  <div class="ranked-threshold-row ranked-tier-${escapeHtml(r.tier)}${current}">
                    <div class="ranked-threshold-rank">
                      <img src="${rankIconUrl(r.tier, r.division)}" alt="" />
                      <span>${escapeHtml(r.name)}</span>
                    </div>
                    <span class="ranked-threshold-rp">${formatRp(r.minRp)}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <section id="ranked-season-section" class="ranked-panel ranked-season hud-panel">
          <header class="ranked-season-header">
            <div>
              <p class="ranked-eyebrow">SEASON PROGRESSION</p>
              <h3 class="ranked-season-title">${escapeHtml(data.season.name)}</h3>
            </div>
            <div class="ranked-season-meta">
              <span>Track Level ${seasonStats.seasonLevel}</span>
              <span>${formatWinRate(career.winRate)} career WR</span>
            </div>
          </header>
          <div class="ranked-season-rail" role="list">
            <div
              class="ranked-season-rail-inner"
              style="--season-progress: ${seasonTrackProgressPct(
                trackLevels,
                seasonStats.seasonLevel,
                seasonStats.seasonXpIntoLevel,
                seasonStats.seasonXpForNextLevel,
              )}%"
            >
            <div class="ranked-season-progress-line" aria-hidden="true">
              <div class="ranked-season-progress-line-track"></div>
              <div class="ranked-season-progress-line-fill"></div>
            </div>
            ${trackLevels
              .map((level) => {
                const reward = rewardByLevel.get(level);
                const done = level < seasonStats.seasonLevel;
                const current = level === seasonStats.seasonLevel;
                const locked = level > seasonStats.seasonLevel;
                const state = current ? 'is-current' : done ? 'is-done' : 'is-locked';
                const labels = seasonRewardCardLabels(reward, level);
                const alt = labels.secondary
                  ? `${labels.primary} ${labels.secondary}`
                  : labels.primary;
                const previewUrl = reward?.previewImageUrl?.trim() || null;
                const isPlasmaCurrency =
                  reward?.rewardType === 'credits' || reward?.rewardType === 'minerals';
                const canPreview = reward ? isSeasonRewardModelPreviewable(reward) : false;
                const canRedeem = Boolean(reward?.unlocked && !reward.claimed);
                const claimed = Boolean(reward?.claimed);
                const preview = isPlasmaCurrency
                  ? `<img class="ranked-season-step-preview ranked-season-step-preview--plasma" src="${PLASMA_MINERALS_ICON_SRC}" alt="${escapeHtml(alt)}" />`
                  : previewUrl
                    ? `<img class="ranked-season-step-preview" src="${escapeHtml(previewUrl)}" alt="${escapeHtml(alt)}" />`
                    : `<span class="ranked-season-step-icon" aria-hidden="true"></span>`;
                const previewBtn = canPreview
                  ? `<button type="button" class="ranked-season-preview-btn" data-season-preview-level="${level}">PREVIEW ITEM</button>`
                  : '';
                const redeemBtn = reward
                  ? claimed
                    ? `<button type="button" class="ranked-season-redeem-btn is-claimed" disabled>REDEEMED</button>`
                    : `<button type="button" class="ranked-season-redeem-btn" data-season-redeem-level="${level}" ${canRedeem ? '' : 'disabled'}>REDEEM</button>`
                  : '';
                const lockBadge = locked
                  ? '<span class="ranked-season-step-lock" aria-hidden="true"></span>'
                  : '';
                const statusMark = done
                  ? '<span class="ranked-season-step-check" aria-hidden="true"></span>'
                  : '<span class="ranked-season-step-status-slot" aria-hidden="true"></span>';
                return `
                  <div class="ranked-season-step ${state}${previewUrl || canPreview ? ' has-preview' : ''}" role="listitem">
                    <span class="ranked-season-step-num">${level}</span>
                    <span class="ranked-season-step-node" aria-hidden="true"></span>
                    <div class="ranked-season-step-card">
                      ${lockBadge}
                      ${preview}
                      <span class="ranked-season-step-label">
                        <span class="ranked-season-step-label-primary">${escapeHtml(labels.primary)}</span>
                        ${
                          labels.secondary
                            ? `<span class="ranked-season-step-label-secondary">${escapeHtml(labels.secondary)}</span>`
                            : ''
                        }
                      </span>
                    </div>
                    ${statusMark}
                    ${previewBtn}
                    ${redeemBtn}
                  </div>
                `;
              })
              .join('')}
            </div>
          </div>
          <p class="ranked-season-footer">
            <span class="ranked-season-footer-icon" aria-hidden="true">i</span>
            Play matches, earn XP and complete challenges to unlock rewards!
          </p>
        </section>

        <section class="ranked-info-row" aria-label="Ranked info">
          ${INFO_CARDS.map(
            (card) => `
              <article class="ranked-info-card hud-panel">
                <h4>${card.title}</h4>
                <p>${card.body}</p>
              </article>
            `,
          ).join('')}
        </section>
      </div>
    `;
  }
}
