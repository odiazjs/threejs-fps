import type { PlayerWeaponEntry } from '../../shared/api/weapons';
import type {
  WeaponBaseStats,
  WeaponUpgradeLevels,
  WeaponUpgradeStatId,
} from '../../shared/content/weaponUpgrades';
import {
  WEAPON_UPGRADE_STAT_IDS,
  isPlusUpgradeStat,
  isWeaponUpgradeStatId,
  plasmaMineralCostForLevelRange,
  resolveEffectiveWeaponStats,
  weaponUpgradeStep,
  zeroUpgradeLevels,
} from '../../shared/content/weaponUpgrades';
import { apiBatchUpgradeWeaponStats, apiListMyWeapons, apiResetWeaponStats } from '../auth/weaponsApi';
import {
  formatPlasmaMineralCost,
  formatPlasmaMinerals,
  onPlasmaMineralsChange,
  setPlasmaMineralsDisplay,
} from '../ui/plasmaMineralsHud';
import { showErrorSnackbar, showSuccessSnackbar } from '../ui/snackbar';

const STAT_LABELS: Record<WeaponUpgradeStatId, string> = {
  damage: 'DAMAGE',
  recoil: 'RECOIL',
  range: 'RANGE',
  magazineSize: 'MAG SIZE',
  reloadTime: 'RELOAD',
  adsTime: 'ADS TIME',
  fireRate: 'FIRE RATE',
};

/**
 * Absolute ceiling for each stat bar (full track).
 * Current / draft values fill a portion of this — so each weapon starts at a different level.
 * Also used as the soft max for how far upgrades can push a stat in the Armory UI.
 */
const STAT_MAX: Record<WeaponUpgradeStatId, number> = {
  damage: 100,
  recoil: 100,
  range: 250,
  magazineSize: 40,
  reloadTime: 3.5,
  adsTime: 0.5,
  fireRate: 20,
};

function formatStatValue(stat: WeaponUpgradeStatId, value: number): string {
  switch (stat) {
    case 'magazineSize':
      return String(Math.round(value));
    case 'reloadTime':
    case 'adsTime':
      return `${value.toFixed(2)}s`;
    case 'fireRate':
      return `${value.toFixed(1)}/s`;
    case 'recoil':
      return value.toFixed(0);
    case 'damage':
    case 'range':
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    default:
      return String(value);
  }
}

function readStat(stats: WeaponBaseStats, stat: WeaponUpgradeStatId): number {
  return stats[stat];
}

function emptyPending(): WeaponUpgradeLevels {
  return zeroUpgradeLevels();
}

/** 0–1 ratio of value along the track (matches native range thumb travel). */
function fillRatio(stat: WeaponUpgradeStatId, value: number): number {
  const max = STAT_MAX[stat];
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const decimals = step < 0.1 ? 3 : 2;
  const factor = 10 ** decimals;
  return Math.round(Math.round(value / step) * step * factor) / factor;
}

/** Round slider value to the nearest valid upgrade step from the saved value. */
function snapToUpgradeStep(
  stat: WeaponUpgradeStatId,
  savedValue: number,
  rawValue: number,
): number {
  const step = weaponUpgradeStep(stat);
  const deltaSteps = Math.round((rawValue - savedValue) / step);
  return roundToStep(savedValue + deltaSteps * step, step);
}

/** Upgrade level that produces `value` from catalog base (may be negative). */
function levelForValue(
  stat: WeaponUpgradeStatId,
  base: number,
  value: number,
): number {
  const step = weaponUpgradeStep(stat);
  if (step <= 0) return 0;
  if (isPlusUpgradeStat(stat)) {
    return Math.round((value - base) / step);
  }
  return Math.round((base - value) / step);
}

/** Pending level delta from saved → draft (may be negative). */
function valueToPending(
  stat: WeaponUpgradeStatId,
  savedValue: number,
  draftValue: number,
  step: number,
): number {
  if (isPlusUpgradeStat(stat)) {
    return Math.round((draftValue - savedValue) / step);
  }
  return Math.round((savedValue - draftValue) / step);
}

/** Level bounds that keep the effective value on the Armory track [0, STAT_MAX]. */
function trackLevelBounds(
  entry: PlayerWeaponEntry,
  stat: WeaponUpgradeStatId,
): { minLevel: number; maxLevel: number } {
  const base = readStat(entry.baseStats, stat);
  const trackMax = STAT_MAX[stat];
  const atZero = levelForValue(stat, base, 0);
  const atMax = levelForValue(stat, base, trackMax);
  return {
    minLevel: Math.min(atZero, atMax),
    maxLevel: Math.max(atZero, atMax),
  };
}

/** Max pending levels affordable when increasing level (costs plasma). */
function maxAffordablePending(
  savedLevel: number,
  otherCost: number,
  balance: number,
  maxLevel: number,
): number {
  let pending = 0;
  let spent = 0;
  while (savedLevel + pending < maxLevel) {
    const stepCost = plasmaMineralCostForLevelRange(
      savedLevel + pending,
      savedLevel + pending + 1,
    );
    if (stepCost <= 0 || otherCost + spent + stepCost > balance) break;
    spent += stepCost;
    pending += 1;
  }
  return pending;
}

function draftValueAtPending(
  entry: PlayerWeaponEntry,
  stat: WeaponUpgradeStatId,
  pending: number,
): number {
  const levels = {
    ...entry.levels,
    [stat]: entry.levels[stat] + pending,
  };
  return readStat(resolveEffectiveWeaponStats(entry.baseStats, levels), stat);
}

function formatDraftCost(cost: number): string {
  if (cost === 0) return '—';
  return formatPlasmaMineralCost(cost);
}

export class ArmoryWeaponStatsPanel {
  private weaponsById = new Map<string, PlayerWeaponEntry>();
  private selectedWeaponId: string | null = null;
  private plasmaMinerals = 0;
  private pendingByWeapon = new Map<string, WeaponUpgradeLevels>();
  private saving = false;
  private resetting = false;
  private unsubscribeMinerals: (() => void) | null = null;

  private readonly onInput = (event: Event): void => {
    this.handleInput(event);
  };

  private readonly onClick = (event: MouseEvent): void => {
    void this.handleClick(event);
  };

  constructor(
    private readonly titleEl: HTMLElement,
    private readonly statusEl: HTMLElement | null,
    private readonly bodyEl: HTMLElement,
  ) {}

  async mount(initialWeaponId = 'pistol'): Promise<void> {
    this.dispose();
    this.bodyEl.addEventListener('input', this.onInput);
    this.bodyEl.addEventListener('click', this.onClick);
    this.unsubscribeMinerals = onPlasmaMineralsChange((amount) => {
      this.plasmaMinerals = amount;
      const weaponId = this.selectedWeaponId;
      const entry = weaponId ? this.weaponsById.get(weaponId) : undefined;
      if (entry) this.syncDraftUi(entry);
    });
    this.setStatus('Loading weapon stats...');
    try {
      const { weapons, plasmaMinerals } = await apiListMyWeapons();
      this.weaponsById = new Map(weapons.map((entry) => [entry.id, entry]));
      this.plasmaMinerals = plasmaMinerals;
      this.setStatus('');
      this.showWeapon(initialWeaponId);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Could not load weapon stats');
      this.bodyEl.innerHTML = '';
    }
  }

  dispose(): void {
    this.bodyEl.removeEventListener('input', this.onInput);
    this.bodyEl.removeEventListener('click', this.onClick);
    this.unsubscribeMinerals?.();
    this.unsubscribeMinerals = null;
    this.weaponsById.clear();
    this.pendingByWeapon.clear();
    this.selectedWeaponId = null;
    this.saving = false;
    this.resetting = false;
  }

  showWeapon(weaponId: string): void {
    this.selectedWeaponId = weaponId;
    this.render();
  }

  private getPending(weaponId: string): WeaponUpgradeLevels {
    let pending = this.pendingByWeapon.get(weaponId);
    if (!pending) {
      pending = emptyPending();
      this.pendingByWeapon.set(weaponId, pending);
    }
    return pending;
  }

  private draftLevels(entry: PlayerWeaponEntry): WeaponUpgradeLevels {
    const pending = this.getPending(entry.id);
    const draft = emptyPending();
    for (const stat of WEAPON_UPGRADE_STAT_IDS) {
      draft[stat] = entry.levels[stat] + pending[stat];
    }
    return draft;
  }

  private totalDraftCost(entry: PlayerWeaponEntry, exceptStat?: WeaponUpgradeStatId): number {
    const pending = this.getPending(entry.id);
    let total = 0;
    for (const stat of WEAPON_UPGRADE_STAT_IDS) {
      if (stat === exceptStat) continue;
      total += plasmaMineralCostForLevelRange(
        entry.levels[stat],
        entry.levels[stat] + pending[stat],
      );
    }
    return total;
  }

  private hasAnyPending(entry: PlayerWeaponEntry): boolean {
    const pending = this.getPending(entry.id);
    return WEAPON_UPGRADE_STAT_IDS.some((stat) => pending[stat] !== 0);
  }

  private isAtBaseLevels(entry: PlayerWeaponEntry): boolean {
    return WEAPON_UPGRADE_STAT_IDS.every((stat) => entry.levels[stat] === 0);
  }

  private canResetStats(entry: PlayerWeaponEntry): boolean {
    return !this.saving && !this.resetting && (!this.isAtBaseLevels(entry) || this.hasAnyPending(entry));
  }

  private isBusy(): boolean {
    return this.saving || this.resetting;
  }

  private setStatus(message: string): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.hidden = !message;
  }

  private handleInput(event: Event): void {
    if (this.isBusy()) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-upgrade-slider]')) return;

    const statRaw = target.dataset.stat;
    if (!statRaw || !isWeaponUpgradeStatId(statRaw)) return;

    const weaponId = this.selectedWeaponId;
    const entry = weaponId ? this.weaponsById.get(weaponId) : undefined;
    if (!entry || !weaponId) return;

    const savedLevel = entry.levels[statRaw];
    const savedValue = readStat(entry.effectiveStats, statRaw);
    const trackMax = STAT_MAX[statRaw];
    const rawValue = Math.max(0, Math.min(trackMax, Number(target.value)));
    if (!Number.isFinite(rawValue)) return;

    const step = weaponUpgradeStep(statRaw);
    const snapped = Math.max(0, Math.min(trackMax, snapToUpgradeStep(statRaw, savedValue, rawValue)));
    const desiredPending = valueToPending(statRaw, savedValue, snapped, step);

    const { minLevel, maxLevel } = trackLevelBounds(entry, statRaw);
    const otherCost = this.totalDraftCost(entry, statRaw);
    const maxUp = maxAffordablePending(savedLevel, otherCost, this.plasmaMinerals, maxLevel);
    // Decreasing level (refund / worse-than-base) is always free within the track.
    const minDown = minLevel - savedLevel;
    const nextPending = Math.max(minDown, Math.min(desiredPending, maxUp));
    const nextValue = draftValueAtPending(entry, statRaw, nextPending);

    target.value = String(nextValue);
    this.getPending(weaponId)[statRaw] = nextPending;
    this.syncDraftUi(entry);
  }

  private async handleClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-upgrade-reset]')) {
      await this.resetStats();
      return;
    }
    if (target.closest('[data-upgrade-save]')) {
      await this.commitUpgrades();
    }
  }

  private async resetStats(): Promise<void> {
    if (this.isBusy()) return;
    const weaponId = this.selectedWeaponId;
    const entry = weaponId ? this.weaponsById.get(weaponId) : undefined;
    if (!entry || !weaponId || !this.canResetStats(entry)) return;

    // Draft-only changes: snap UI back to saved levels without a network round-trip.
    if (this.isAtBaseLevels(entry)) {
      this.pendingByWeapon.set(weaponId, emptyPending());
      this.setStatus('Stats reset to base');
      this.render();
      return;
    }

    this.resetting = true;
    this.setStatus('Resetting stats...');
    this.render();

    try {
      const result = await apiResetWeaponStats(weaponId);
      this.plasmaMinerals = result.plasmaMinerals;
      this.weaponsById.set(weaponId, result.weapon);
      this.pendingByWeapon.set(weaponId, emptyPending());
      setPlasmaMineralsDisplay(this.plasmaMinerals);

      if (result.costSpent < 0) {
        const message = `Stats reset (+${formatPlasmaMinerals(-result.costSpent)} plasma refunded)`;
        this.setStatus(message);
        showSuccessSnackbar(message);
      } else if (result.costSpent > 0) {
        const message = `Stats reset (−${formatPlasmaMinerals(result.costSpent)} plasma)`;
        this.setStatus(message);
        showSuccessSnackbar(message);
      } else {
        this.setStatus('Stats reset to base');
        showSuccessSnackbar('Weapon stats reset to base');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reset stats';
      this.setStatus(message);
      showErrorSnackbar(message);
      try {
        const { weapons, plasmaMinerals } = await apiListMyWeapons();
        this.weaponsById = new Map(weapons.map((row) => [row.id, row]));
        this.plasmaMinerals = plasmaMinerals;
        this.pendingByWeapon.set(weaponId, emptyPending());
      } catch {
        // keep local state if refresh fails
      }
    } finally {
      this.resetting = false;
      this.render();
    }
  }

  private async commitUpgrades(): Promise<void> {
    if (this.isBusy()) return;
    const weaponId = this.selectedWeaponId;
    const entry = weaponId ? this.weaponsById.get(weaponId) : undefined;
    if (!entry || !weaponId || !this.hasAnyPending(entry)) return;

    const pending = { ...this.getPending(weaponId) };
    const totalCost = this.totalDraftCost(entry);
    if (totalCost > this.plasmaMinerals) {
      this.setStatus('Not enough plasma minerals');
      return;
    }

    this.saving = true;
    this.setStatus('Saving upgrades...');
    this.render();

    try {
      const deltas: Partial<Record<WeaponUpgradeStatId, number>> = {};
      for (const stat of WEAPON_UPGRADE_STAT_IDS) {
        if (pending[stat] !== 0) deltas[stat] = pending[stat];
      }

      const result = await apiBatchUpgradeWeaponStats(weaponId, deltas);
      this.plasmaMinerals = result.plasmaMinerals;
      this.weaponsById.set(weaponId, result.weapon);
      this.pendingByWeapon.set(weaponId, emptyPending());
      setPlasmaMineralsDisplay(this.plasmaMinerals);
      if (totalCost > 0) {
        const message = `Upgrades saved (−${formatPlasmaMinerals(totalCost)} plasma)`;
        this.setStatus(message);
        showSuccessSnackbar(message);
      } else if (totalCost < 0) {
        const message = `Upgrades saved (+${formatPlasmaMinerals(-totalCost)} plasma refunded)`;
        this.setStatus(message);
        showSuccessSnackbar(message);
      } else {
        this.setStatus('Saved');
        showSuccessSnackbar('Weapon upgrades saved');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save upgrades';
      this.setStatus(message);
      showErrorSnackbar(message);
      try {
        const { weapons, plasmaMinerals } = await apiListMyWeapons();
        this.weaponsById = new Map(weapons.map((row) => [row.id, row]));
        this.plasmaMinerals = plasmaMinerals;
        this.pendingByWeapon.set(weaponId, emptyPending());
      } catch {
        // keep local state if refresh fails
      }
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private updateSliderFill(slider: HTMLInputElement, stat: WeaponUpgradeStatId, value: number): void {
    const ratio = fillRatio(stat, value);
    const track = slider.closest<HTMLElement>('.armory-stat-slider-track');
    if (track) track.style.setProperty('--ratio', String(ratio));
  }

  /** Update labels/costs without rebuilding sliders (keeps drag alive). */
  private syncDraftUi(entry: PlayerWeaponEntry): void {
    const pending = this.getPending(entry.id);
    const draftLevels = this.draftLevels(entry);
    const draftStats = resolveEffectiveWeaponStats(entry.baseStats, draftLevels);
    const totalCost = this.totalDraftCost(entry);
    const hasPending = this.hasAnyPending(entry);

    for (const stat of WEAPON_UPGRADE_STAT_IDS) {
      const row = this.bodyEl.querySelector<HTMLElement>(`[data-stat-row="${stat}"]`);
      if (!row) continue;

      const savedValue = readStat(entry.effectiveStats, stat);
      const draftValue = readStat(draftStats, stat);
      const pendingLevels = pending[stat];
      const valuesEl = row.querySelector('.armory-stat-values');
      if (valuesEl) {
        valuesEl.innerHTML =
          pendingLevels !== 0
            ? `<span class="armory-stat-value armory-stat-value--saved">${formatStatValue(stat, savedValue)}</span>
               <span class="armory-stat-value-arrow" aria-hidden="true">→</span>
               <span class="armory-stat-value armory-stat-value--draft">${formatStatValue(stat, draftValue)}</span>`
            : `<span class="armory-stat-value">${formatStatValue(stat, draftValue)}</span>`;
      }

      const costEl = row.querySelector('.armory-stat-upgrade-cost');
      if (costEl) {
        const cost = plasmaMineralCostForLevelRange(entry.levels[stat], draftLevels[stat]);
        costEl.textContent = formatDraftCost(cost);
        costEl.classList.toggle('is-active', pendingLevels !== 0);
        costEl.classList.toggle('is-refund', cost < 0);
      }

      row.classList.toggle('is-draft', pendingLevels !== 0);

      const slider = row.querySelector<HTMLInputElement>('[data-upgrade-slider]');
      if (slider) {
        if (document.activeElement !== slider) {
          slider.value = String(draftValue);
        }
        this.updateSliderFill(slider, stat, Number(slider.value));
      }
    }

    const totalEl = this.bodyEl.querySelector('[data-upgrade-total-cost]');
    if (totalEl) {
      totalEl.textContent = formatDraftCost(totalCost);
      totalEl.classList.toggle('is-refund', totalCost < 0);
    }

    const saveBtn = this.bodyEl.querySelector<HTMLButtonElement>('[data-upgrade-save]');
    if (saveBtn) {
      saveBtn.disabled = !hasPending || this.isBusy();
      saveBtn.textContent = this.saving ? 'SAVING…' : 'SAVE UPGRADE';
    }

    const resetBtn = this.bodyEl.querySelector<HTMLButtonElement>('[data-upgrade-reset]');
    if (resetBtn) {
      resetBtn.disabled = !this.canResetStats(entry);
      resetBtn.textContent = this.resetting ? 'RESETTING…' : 'RESET STATS';
    }
  }

  private render(): void {
    const weaponId = this.selectedWeaponId;
    const entry = weaponId ? this.weaponsById.get(weaponId) : undefined;

    if (!entry) {
      this.titleEl.textContent = 'WEAPON STATS';
      this.bodyEl.innerHTML =
        '<p class="armory-stats-panel-empty">Select a weapon to view stats.</p>';
      return;
    }

    const pending = this.getPending(entry.id);
    const draftLevels = this.draftLevels(entry);
    const draftStats = resolveEffectiveWeaponStats(entry.baseStats, draftLevels);
    const totalCost = this.totalDraftCost(entry);
    const hasPending = this.hasAnyPending(entry);

    this.titleEl.textContent = `${entry.displayName.toUpperCase()} STATS`;

    const rows = WEAPON_UPGRADE_STAT_IDS.map((stat) => {
      const savedLevel = entry.levels[stat];
      const pendingLevels = pending[stat];
      const draftLevel = draftLevels[stat];
      const savedValue = readStat(entry.effectiveStats, stat);
      const draftValue = readStat(draftStats, stat);
      const trackMax = STAT_MAX[stat];
      const ratio = fillRatio(stat, draftValue);
      const canEdit = !this.isBusy();

      const valueHtml =
        pendingLevels !== 0
          ? `<span class="armory-stat-value armory-stat-value--saved">${formatStatValue(stat, savedValue)}</span>
             <span class="armory-stat-value-arrow" aria-hidden="true">→</span>
             <span class="armory-stat-value armory-stat-value--draft">${formatStatValue(stat, draftValue)}</span>`
          : `<span class="armory-stat-value">${formatStatValue(stat, draftValue)}</span>`;

      const cost = plasmaMineralCostForLevelRange(savedLevel, draftLevel);
      const costPreview = formatDraftCost(cost);

      return `
        <div class="armory-stat armory-stat--panel${pendingLevels !== 0 ? ' is-draft' : ''}" data-stat-row="${stat}">
          <span class="armory-stat-label">${STAT_LABELS[stat]}</span>
          <div class="armory-stat-slider-track" style="--ratio: ${ratio}">
            <div class="armory-stat-slider-rail" aria-hidden="true">
              <span class="armory-stat-slider-fill"></span>
            </div>
            <input
              type="range"
              class="armory-stat-slider"
              data-upgrade-slider
              data-stat="${stat}"
              min="0"
              max="${trackMax}"
              step="any"
              value="${draftValue}"
              aria-label="${STAT_LABELS[stat]} upgrade"
              ${canEdit ? '' : 'disabled'}
            />
          </div>
          <span class="armory-stat-values">${valueHtml}</span>
          <span class="armory-stat-upgrade-cost${pendingLevels !== 0 ? ' is-active' : ''}${cost < 0 ? ' is-refund' : ''}">${costPreview}</span>
        </div>
      `;
    }).join('');

    this.bodyEl.innerHTML = `
      <div class="armory-stats-panel-list">${rows}</div>
      <div class="armory-upgrade-footer">
        <div class="armory-upgrade-cost-preview">
          <span class="armory-upgrade-cost-label">UPGRADE COST</span>
          <span class="armory-upgrade-cost-value${totalCost < 0 ? ' is-refund' : ''}" data-upgrade-total-cost>${formatDraftCost(totalCost)}</span>
        </div>
        <button
          type="button"
          class="armory-btn armory-btn--ghost armory-upgrade-reset-btn"
          data-upgrade-reset
          ${!this.canResetStats(entry) ? 'disabled' : ''}
        >${this.resetting ? 'RESETTING…' : 'RESET STATS'}</button>
        <button
          type="button"
          class="armory-btn armory-btn--primary armory-upgrade-save-btn"
          data-upgrade-save
          ${!hasPending || this.isBusy() ? 'disabled' : ''}
        >${this.saving ? 'SAVING…' : 'SAVE UPGRADE'}</button>
      </div>
    `;
  }
}
