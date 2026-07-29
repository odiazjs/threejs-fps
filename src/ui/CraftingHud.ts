import {
  CRAFT_CATALOG,
  CRAFT_HOLD_SEC,
  type CraftItemDef,
  type CraftItemId,
} from '../../shared/content/craftingCatalog';
import { WEAPON_ICON_SRC, SHIELD_CHARGE_ICON_SRC } from '../content/inventoryConfig';
import { PLASMA_MINERALS_ICON_SRC } from './plasmaMineralsHud';
import { isPickableWeaponId } from '../../shared/content/weaponIds';

export interface CraftingHudState {
  readonly matchPlasmaMinerals: number;
  readonly ownedWeaponIds: ReadonlySet<string>;
  readonly emptyWeaponSlots: number;
  readonly grenadeCount: number;
  readonly maxGrenades: number;
  readonly shieldCharges: number;
  readonly maxShieldCharges: number;
}

export type CraftRequestHandler = (itemId: CraftItemId) => void;

function craftingStateKey(state: CraftingHudState): string {
  const owned = [...state.ownedWeaponIds].sort().join(',');
  return [
    state.matchPlasmaMinerals,
    state.emptyWeaponSlots,
    state.grenadeCount,
    state.shieldCharges,
    owned,
  ].join('|');
}

function craftIconSrc(item: CraftItemDef): string {
  if (item.kind === 'weapon' && isPickableWeaponId(item.id)) {
    return WEAPON_ICON_SRC[item.id];
  }
  if (item.kind === 'shield') return SHIELD_CHARGE_ICON_SRC;
  return PLASMA_MINERALS_ICON_SRC;
}

function itemBlockedReason(
  item: CraftItemDef,
  state: CraftingHudState,
): string | null {
  if (state.matchPlasmaMinerals < item.cost) {
    return 'Not enough minerals';
  }
  if (item.kind === 'weapon' && state.ownedWeaponIds.has(item.id)) {
    return 'Already owned - drop it first';
  }
  if (item.kind === 'weapon' && state.emptyWeaponSlots <= 0) {
    return 'Loadout full - drop a weapon';
  }
  if (item.kind === 'grenade' && state.grenadeCount >= state.maxGrenades) {
    return 'Grenade inventory full';
  }
  if (item.kind === 'shield' && state.shieldCharges >= state.maxShieldCharges) {
    return 'Shield inventory full';
  }
  return null;
}

export class CraftingHud {
  private readonly overlay: HTMLElement;
  private readonly balanceEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly promptRoot: HTMLElement;
  private open = false;
  private holdItemId: CraftItemId | null = null;
  private holdStartMs = 0;
  private holdRaf = 0;
  private onCraft: CraftRequestHandler | null = null;
  private onClose: (() => void) | null = null;
  private lastState: CraftingHudState | null = null;
  private lastRenderKey = '';

  constructor() {
    this.overlay = document.getElementById('crafting-overlay')!;
    this.balanceEl = document.getElementById('crafting-balance')!;
    this.gridEl = document.getElementById('crafting-grid')!;
    this.closeBtn = document.getElementById(
      'crafting-close-btn',
    ) as HTMLButtonElement;
    this.promptRoot = document.getElementById('crafting-station-prompt')!;

    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay
      .querySelector('.crafting-backdrop')
      ?.addEventListener('click', () => this.close());

    this.gridEl.addEventListener('pointerdown', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-craft-id]',
      );
      if (!target || target.classList.contains('is-disabled')) return;
      const id = target.dataset.craftId as CraftItemId | undefined;
      if (!id) return;
      event.preventDefault();
      this.beginHold(id, target);
    });

    window.addEventListener('pointerup', () => this.cancelHold());
    window.addEventListener('pointercancel', () => this.cancelHold());
    window.addEventListener('blur', () => this.cancelHold());
  }

  setCallbacks(onCraft: CraftRequestHandler, onClose: () => void): void {
    this.onCraft = onCraft;
    this.onClose = onClose;
  }

  isOpen(): boolean {
    return this.open;
  }

  setPromptVisible(visible: boolean): void {
    this.promptRoot.hidden = !visible || this.open;
  }

  openPanel(state: CraftingHudState): void {
    this.open = true;
    this.lastRenderKey = '';
    this.overlay.hidden = false;
    this.overlay.classList.add('is-open');
    this.promptRoot.hidden = true;
    this.refresh(state);
  }

  close(notify = true): void {
    if (!this.open) return;
    this.cancelHold();
    this.open = false;
    this.overlay.classList.remove('is-open');
    this.overlay.hidden = true;
    if (notify) this.onClose?.();
  }

  refresh(state: CraftingHudState): void {
    this.lastState = state;
    this.balanceEl.textContent = String(state.matchPlasmaMinerals);
    const renderKey = craftingStateKey(state);
    // Avoid rebuilding the grid every frame  that resets the 3s hold fill.
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;
    this.cancelHold();
    this.gridEl.innerHTML = CRAFT_CATALOG.map((item) => {
      const blocked = itemBlockedReason(item, state);
      const disabled = Boolean(blocked);
      return `
        <button
          type="button"
          class="crafting-card${disabled ? ' is-disabled' : ''}"
          data-craft-id="${item.id}"
          ${disabled ? 'disabled' : ''}
        >
          <div class="crafting-card-hold">
            <div class="crafting-card-hold-fill" data-craft-fill></div>
          </div>
          <img class="crafting-card-icon" src="${craftIconSrc(item)}" alt="" />
          <span class="crafting-card-name">${item.label}</span>
          <span class="crafting-card-cost">
            <img src="${PLASMA_MINERALS_ICON_SRC}" alt="" />
            ${item.cost}
          </span>
          <span class="crafting-card-hint">${
            blocked ?? 'Hold click 3s to craft'
          }</span>
        </button>
      `;
    }).join('');
  }

  private beginHold(itemId: CraftItemId, card: HTMLElement): void {
    if (!this.open || !this.lastState) return;
    const item = CRAFT_CATALOG.find((entry) => entry.id === itemId);
    if (!item || itemBlockedReason(item, this.lastState)) return;

    this.cancelHold();
    this.holdItemId = itemId;
    this.holdStartMs = performance.now();
    const fill = card.querySelector<HTMLElement>('[data-craft-fill]');

    const tick = () => {
      if (!this.holdItemId) return;
      const elapsed = (performance.now() - this.holdStartMs) / 1000;
      const pct = Math.min(1, elapsed / CRAFT_HOLD_SEC);
      if (fill) fill.style.transform = `scaleX(${pct})`;
      if (pct >= 1) {
        const craftedId = this.holdItemId;
        this.cancelHold();
        this.onCraft?.(craftedId);
        return;
      }
      this.holdRaf = requestAnimationFrame(tick);
    };
    this.holdRaf = requestAnimationFrame(tick);
  }

  private cancelHold(): void {
    if (this.holdRaf) {
      cancelAnimationFrame(this.holdRaf);
      this.holdRaf = 0;
    }
    this.holdItemId = null;
    for (const fill of this.gridEl.querySelectorAll<HTMLElement>(
      '[data-craft-fill]',
    )) {
      fill.style.transform = 'scaleX(0)';
    }
  }
}
