import type { WeaponId } from '../../shared/content/weaponIds';
import { SHIELD_CHARGE_ICON_SRC, WEAPON_ICON_SRC } from '../content/inventoryConfig';

export interface InventoryWeaponEntry {
  slotIndex: number;
  weaponId: WeaponId | null;
  name: string;
  active: boolean;
  occupied: boolean;
}

export interface InventoryViewState {
  weapons: readonly InventoryWeaponEntry[];
  shieldCharges: number;
}

const DROP_HOLD_MS = 3000;
const DROP_UI_DELAY_MS = 500;
const DROP_RING_RADIUS = 34;
const DROP_RING_CIRCUMFERENCE = 2 * Math.PI * DROP_RING_RADIUS;

export class InventoryHud {
  private open = false;
  private readonly root: HTMLElement;
  private readonly loadoutRoot: HTMLElement;
  private readonly shieldRow: HTMLElement;
  private readonly shieldCountEl: HTMLElement;
  private readonly weaponSlots: HTMLElement[] = [];
  private dropHoldSlot: number | null = null;
  private dropHoldStart = 0;
  private dropRafId = 0;
  private shieldDropHoldStart = 0;
  private shieldDropRafId = 0;
  private shieldDroppable = false;
  private onWeaponDropRequest: ((slotIndex: number) => void) | null = null;
  private onShieldDropRequest: (() => void) | null = null;
  private slotOccupied: boolean[] = [];

  constructor(weaponOrder: readonly { id: WeaponId; name: string }[]) {
    this.root = document.getElementById('inventory-overlay')!;
    this.loadoutRoot = document.getElementById('inventory-loadout')!;
    this.shieldRow = document.getElementById('inventory-shield-row')!;
    this.shieldCountEl = document.getElementById('inventory-shield-count')!;

    for (let i = 0; i < weaponOrder.length; i++) {
      const weapon = weaponOrder[i]!;
      const slot = document.createElement('div');
      slot.className = 'inventory-weapon-slot';
      slot.dataset.slotIndex = String(i);
      slot.innerHTML = `
        <div class="inventory-slot-key">${i + 1}</div>
        <div class="inventory-icon-wrap">
          <img class="inventory-weapon-icon" src="${WEAPON_ICON_SRC[weapon.id]}" alt="" />
        </div>
        <div class="inventory-weapon-name">${weapon.name}</div>
        <div class="inventory-drop-overlay" hidden>
          <svg class="inventory-drop-spinner" viewBox="0 0 80 80" aria-hidden="true">
            <circle class="inventory-drop-ring-bg" cx="40" cy="40" r="${DROP_RING_RADIUS}" />
            <circle class="inventory-drop-ring-fill" cx="40" cy="40" r="${DROP_RING_RADIUS}" />
          </svg>
          <div class="inventory-drop-timer">Dropping in 3.0s</div>
        </div>
      `;

      slot.addEventListener('mousedown', (event) => this.onSlotPointerDown(i, event));
      slot.addEventListener('mouseup', () => this.cancelDropHold());
      slot.addEventListener('mouseleave', () => this.cancelDropHold());
      slot.addEventListener('touchstart', (event) => this.onSlotPointerDown(i, event), {
        passive: false,
      });
      slot.addEventListener('touchend', () => this.cancelDropHold());
      slot.addEventListener('touchcancel', () => this.cancelDropHold());

      const ring = slot.querySelector('.inventory-drop-ring-fill') as SVGCircleElement;
      ring.style.strokeDasharray = String(DROP_RING_CIRCUMFERENCE);
      ring.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);

      this.loadoutRoot.appendChild(slot);
      this.weaponSlots.push(slot);
      this.slotOccupied.push(true);
    }

    const shieldIcon = document.getElementById('inventory-shield-icon') as HTMLImageElement;
    shieldIcon.src = SHIELD_CHARGE_ICON_SRC;

    const shieldRing = this.shieldRow.querySelector(
      '.inventory-drop-ring-fill',
    ) as SVGCircleElement;
    shieldRing.style.strokeDasharray = String(DROP_RING_CIRCUMFERENCE);
    shieldRing.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);

    this.shieldRow.addEventListener('mousedown', (event) => this.onShieldPointerDown(event));
    this.shieldRow.addEventListener('mouseup', () => this.cancelShieldDropHold());
    this.shieldRow.addEventListener('mouseleave', () => this.cancelShieldDropHold());
    this.shieldRow.addEventListener('touchstart', (event) => this.onShieldPointerDown(event), {
      passive: false,
    });
    this.shieldRow.addEventListener('touchend', () => this.cancelShieldDropHold());
    this.shieldRow.addEventListener('touchcancel', () => this.cancelShieldDropHold());
  }

  setOnWeaponDropRequest(handler: (slotIndex: number) => void): void {
    this.onWeaponDropRequest = handler;
  }

  setOnShieldDropRequest(handler: () => void): void {
    this.onShieldDropRequest = handler;
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): boolean {
    this.setOpen(!this.open);
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.hidden = !open;
    if (!open) {
      this.cancelDropHold();
      this.cancelShieldDropHold();
    }
  }

  update(state: InventoryViewState): void {
    for (let i = 0; i < state.weapons.length; i++) {
      const weapon = state.weapons[i]!;
      const slot = this.weaponSlots[i];
      if (!slot) continue;

      this.slotOccupied[i] = weapon.occupied;
      slot.classList.toggle('active', weapon.active);
      slot.classList.toggle('empty', !weapon.occupied);
      slot.classList.toggle('droppable', weapon.occupied);

      const nameEl = slot.querySelector('.inventory-weapon-name');
      if (nameEl) nameEl.textContent = weapon.name;

      const icon = slot.querySelector('.inventory-weapon-icon') as HTMLImageElement;
      if (icon) {
        if (weapon.occupied && weapon.weaponId) {
          icon.src = WEAPON_ICON_SRC[weapon.weaponId];
          icon.hidden = false;
        } else {
          icon.hidden = true;
        }
      }
    }

    this.shieldDroppable = state.shieldCharges > 0;
    this.shieldRow.classList.toggle('droppable', this.shieldDroppable);
    this.shieldCountEl.textContent = String(state.shieldCharges);
  }

  private onSlotPointerDown(slotIndex: number, event: Event): void {
    if (!this.open || !this.slotOccupied[slotIndex]) return;
    event.preventDefault();
    this.cancelShieldDropHold();
    this.startDropHold(slotIndex);
  }

  private onShieldPointerDown(event: Event): void {
    if (!this.open || !this.shieldDroppable) return;
    event.preventDefault();
    this.cancelDropHold();
    this.startShieldDropHold();
  }

  private startDropHold(slotIndex: number): void {
    this.cancelDropHold();
    this.dropHoldSlot = slotIndex;
    this.dropHoldStart = performance.now();
    this.tickDropHold();
  }

  private startShieldDropHold(): void {
    this.cancelShieldDropHold();
    this.shieldDropHoldStart = performance.now();
    this.tickShieldDropHold();
  }

  private setDropOverlayVisible(slotIndex: number, visible: boolean): void {
    const slot = this.weaponSlots[slotIndex];
    if (!slot) return;

    const overlay = slot.querySelector('.inventory-drop-overlay') as HTMLElement | null;
    if (visible) {
      overlay?.removeAttribute('hidden');
      slot.classList.add('dropping');
    } else {
      overlay?.setAttribute('hidden', '');
      slot.classList.remove('dropping');
      const ring = slot.querySelector('.inventory-drop-ring-fill') as SVGCircleElement | null;
      if (ring) {
        ring.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);
      }
    }
  }

  private setShieldDropOverlayVisible(visible: boolean): void {
    const overlay = this.shieldRow.querySelector('.inventory-drop-overlay') as HTMLElement | null;
    if (visible) {
      overlay?.removeAttribute('hidden');
      this.shieldRow.classList.add('dropping');
    } else {
      overlay?.setAttribute('hidden', '');
      this.shieldRow.classList.remove('dropping');
      const ring = this.shieldRow.querySelector(
        '.inventory-drop-ring-fill',
      ) as SVGCircleElement | null;
      if (ring) {
        ring.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);
      }
    }
  }

  private tickDropHold = (): void => {
    if (this.dropHoldSlot === null) return;

    const elapsed = performance.now() - this.dropHoldStart;
    const showUi = elapsed >= DROP_UI_DELAY_MS;

    if (showUi) {
      this.setDropOverlayVisible(this.dropHoldSlot, true);

      const uiElapsed = elapsed - DROP_UI_DELAY_MS;
      const uiDuration = DROP_HOLD_MS - DROP_UI_DELAY_MS;
      const progress = Math.min(1, uiElapsed / uiDuration);
      const remaining = Math.max(0, DROP_HOLD_MS - elapsed) / 1000;

      const slot = this.weaponSlots[this.dropHoldSlot];
      const timerEl = slot?.querySelector('.inventory-drop-timer');
      if (timerEl) {
        timerEl.textContent = `Dropping in ${remaining.toFixed(1)}s`;
      }

      const ring = slot?.querySelector('.inventory-drop-ring-fill') as SVGCircleElement | null;
      if (ring) {
        ring.style.strokeDashoffset = String(
          DROP_RING_CIRCUMFERENCE * (1 - progress),
        );
      }
    } else {
      this.setDropOverlayVisible(this.dropHoldSlot, false);
    }

    if (elapsed >= DROP_HOLD_MS) {
      const slotIndex = this.dropHoldSlot;
      this.cancelDropHold();
      this.onWeaponDropRequest?.(slotIndex);
      return;
    }

    this.dropRafId = requestAnimationFrame(this.tickDropHold);
  };

  private tickShieldDropHold = (): void => {
    if (!this.shieldDropHoldStart) return;

    const elapsed = performance.now() - this.shieldDropHoldStart;
    const showUi = elapsed >= DROP_UI_DELAY_MS;

    if (showUi) {
      this.setShieldDropOverlayVisible(true);

      const uiElapsed = elapsed - DROP_UI_DELAY_MS;
      const uiDuration = DROP_HOLD_MS - DROP_UI_DELAY_MS;
      const progress = Math.min(1, uiElapsed / uiDuration);
      const remaining = Math.max(0, DROP_HOLD_MS - elapsed) / 1000;

      const timerEl = this.shieldRow.querySelector('.inventory-drop-timer');
      if (timerEl) {
        timerEl.textContent = `Dropping in ${remaining.toFixed(1)}s`;
      }

      const ring = this.shieldRow.querySelector(
        '.inventory-drop-ring-fill',
      ) as SVGCircleElement | null;
      if (ring) {
        ring.style.strokeDashoffset = String(
          DROP_RING_CIRCUMFERENCE * (1 - progress),
        );
      }
    } else {
      this.setShieldDropOverlayVisible(false);
    }

    if (elapsed >= DROP_HOLD_MS) {
      this.cancelShieldDropHold();
      this.onShieldDropRequest?.();
      return;
    }

    this.shieldDropRafId = requestAnimationFrame(this.tickShieldDropHold);
  };

  private cancelDropHold(): void {
    if (this.dropRafId) {
      cancelAnimationFrame(this.dropRafId);
      this.dropRafId = 0;
    }

    if (this.dropHoldSlot !== null) {
      this.setDropOverlayVisible(this.dropHoldSlot, false);
    }

    this.dropHoldSlot = null;
    this.dropHoldStart = 0;
  }

  private cancelShieldDropHold(): void {
    if (this.shieldDropRafId) {
      cancelAnimationFrame(this.shieldDropRafId);
      this.shieldDropRafId = 0;
    }

    if (this.shieldDropHoldStart) {
      this.setShieldDropOverlayVisible(false);
    }

    this.shieldDropHoldStart = 0;
  }
}
