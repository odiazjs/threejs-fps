import type { WeaponLoadoutSummary } from '../../shared/api/loadouts';
import { isWeaponId } from '../../shared/content/weaponIds';
import { getWeaponConfig } from '../content/weaponConfig';
import { WEAPON_ICON_SRC } from '../content/inventoryConfig';

const PENDING_TIMEOUT_MS = 5000;

export interface LoadoutSwitcherActiveSlots {
  primaryWeaponId: string | null;
  secondaryWeaponId: string | null;
}

export interface LoadoutApplyRequest {
  loadoutId: string;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  primarySightId: string | null;
  secondarySightId: string | null;
}

export class LoadoutSwitcherHud {
  private readonly listRoot: HTMLElement;
  private readonly emptyEl: HTMLElement;
  private loadouts: WeaponLoadoutSummary[] = [];
  private loadoutById = new Map<string, WeaponLoadoutSummary>();
  private activeSlots: LoadoutSwitcherActiveSlots = {
    primaryWeaponId: null,
    secondaryWeaponId: null,
  };
  private pendingLoadoutId: string | null = null;
  private pendingTimer = 0;
  private lastApplyAtMs = 0;
  private onApplyRequest: ((request: LoadoutApplyRequest) => void) | null = null;
  private onPendingTimeout: ((loadoutId: string) => void) | null = null;

  constructor() {
    this.listRoot = document.getElementById('loadout-switcher-list')!;
    this.emptyEl = document.getElementById('loadout-switcher-empty')!;

    // Event delegation — survives re-renders and is more reliable than
    // per-card listeners that get torn down mid-click.
    this.listRoot.addEventListener('pointerup', this.onListPointerUp);
  }

  setOnApplyRequest(handler: ((request: LoadoutApplyRequest) => void) | null): void {
    this.onApplyRequest = handler;
  }

  setOnPendingTimeout(handler: ((loadoutId: string) => void) | null): void {
    this.onPendingTimeout = handler;
  }

  setPanelVisible(visible: boolean): void {
    const panel = document.getElementById('loadout-switcher-panel');
    if (!panel) return;
    panel.hidden = !visible;
  }

  setLoadouts(loadouts: readonly WeaponLoadoutSummary[]): void {
    this.loadouts = [...loadouts];
    this.loadoutById = new Map(loadouts.map((entry) => [entry.id, entry]));
    this.render();
  }

  setActiveSlots(slots: LoadoutSwitcherActiveSlots): void {
    this.activeSlots = slots;
    if (this.pendingLoadoutId) {
      const pending = this.loadoutById.get(this.pendingLoadoutId);
      if (
        pending &&
        pending.primaryWeaponId === slots.primaryWeaponId &&
        pending.secondaryWeaponId === slots.secondaryWeaponId
      ) {
        this.clearPending();
      }
    }
    this.render();
  }

  clearPending(loadoutId?: string): void {
    if (loadoutId && this.pendingLoadoutId && this.pendingLoadoutId !== loadoutId) {
      return;
    }
    if (this.pendingTimer) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = 0;
    }
    if (!this.pendingLoadoutId) return;
    this.pendingLoadoutId = null;
    this.render();
  }

  private onListPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>('[data-loadout-id]');
    if (!card || !this.listRoot.contains(card)) return;

    const loadoutId = card.dataset.loadoutId;
    if (!loadoutId) return;
    const loadout = this.loadoutById.get(loadoutId);
    if (!loadout) return;
    if (this.isActiveLoadout(loadout)) return;

    const now = performance.now();
    if (now - this.lastApplyAtMs < 250) return;
    this.lastApplyAtMs = now;

    event.preventDefault();
    event.stopPropagation();

    const request: LoadoutApplyRequest = {
      loadoutId: loadout.id,
      primaryWeaponId: loadout.primaryWeaponId,
      secondaryWeaponId: loadout.secondaryWeaponId,
      primarySightId: loadout.primarySightId ?? null,
      secondarySightId: loadout.secondarySightId ?? null,
    };
    this.onApplyRequest?.(request);
    this.beginPending(loadout.id);
  };

  private render(): void {
    this.listRoot.replaceChildren();

    if (this.loadouts.length === 0) {
      this.emptyEl.hidden = false;
      return;
    }

    this.emptyEl.hidden = true;

    for (const loadout of this.loadouts) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'inventory-card loadout-switcher-card';
      card.dataset.loadoutId = loadout.id;
      const active = this.isActiveLoadout(loadout);
      const pending = this.pendingLoadoutId === loadout.id;
      card.classList.toggle('active', active);
      card.classList.toggle('is-pending', pending && !active);

      const primaryName = this.weaponLabel(loadout.primaryWeaponId);
      const secondaryName = this.weaponLabel(loadout.secondaryWeaponId);
      const primaryIcon = this.weaponIconSrc(loadout.primaryWeaponId);
      const secondaryIcon = this.weaponIconSrc(loadout.secondaryWeaponId);

      card.innerHTML = `
        <div class="inventory-card-label">${loadout.isDefault ? 'Default' : 'Loadout'}</div>
        <div class="loadout-switcher-name">${escapeHtml(loadout.name)}</div>
        <div class="loadout-switcher-weapons">
          <div class="loadout-switcher-weapon">
            <div class="inventory-icon-wrap">
              ${primaryIcon ? `<img class="inventory-weapon-icon" src="${primaryIcon}" alt="" />` : ''}
            </div>
            <div class="loadout-switcher-weapon-name">${escapeHtml(primaryName)}</div>
          </div>
          <div class="loadout-switcher-weapon">
            <div class="inventory-icon-wrap">
              ${secondaryIcon ? `<img class="inventory-weapon-icon" src="${secondaryIcon}" alt="" />` : ''}
            </div>
            <div class="loadout-switcher-weapon-name">${escapeHtml(secondaryName)}</div>
          </div>
        </div>
      `;

      this.listRoot.appendChild(card);
    }
  }

  private beginPending(loadoutId: string): void {
    if (this.pendingTimer) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = 0;
    }
    this.pendingLoadoutId = loadoutId;
    this.render();
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = 0;
      if (this.pendingLoadoutId === loadoutId) {
        this.pendingLoadoutId = null;
        this.render();
        this.onPendingTimeout?.(loadoutId);
      }
    }, PENDING_TIMEOUT_MS);
  }

  private isActiveLoadout(loadout: WeaponLoadoutSummary): boolean {
    return (
      loadout.primaryWeaponId === this.activeSlots.primaryWeaponId &&
      loadout.secondaryWeaponId === this.activeSlots.secondaryWeaponId
    );
  }

  private weaponLabel(weaponId: string): string {
    if (!isWeaponId(weaponId)) return weaponId;
    return getWeaponConfig(weaponId)?.name ?? weaponId;
  }

  private weaponIconSrc(weaponId: string): string | null {
    if (!isWeaponId(weaponId)) return null;
    return WEAPON_ICON_SRC[weaponId] ?? null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
