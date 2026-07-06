import type { WeaponId } from '../../shared/content/weaponIds';
import { getWeaponConfig } from '../content/weaponConfig';
import { SHIELD_CHARGE_ICON_SRC, WEAPON_ICON_SRC } from '../content/inventoryConfig';

export interface InventoryWeaponEntry {
  slotIndex: number;
  weaponId: WeaponId | null;
  name: string;
  active: boolean;
  occupied: boolean;
}

export interface InventoryMeleeEntry {
  name: string;
  active: boolean;
}

export interface InventoryViewState {
  weapons: readonly InventoryWeaponEntry[];
  melee: InventoryMeleeEntry;
  shieldCharges: number;
  operatorName: string;
  killDeath: string;
  unitsInField: number;
}

const DROP_HOLD_MS = 3000;
const DROP_UI_DELAY_MS = 500;
const DROP_RING_RADIUS = 34;
const DROP_RING_CIRCUMFERENCE = 2 * Math.PI * DROP_RING_RADIUS;
const EXAMINE_HIDE_MS = 2400;

type DropTarget = { kind: 'weapon'; slotIndex: number } | { kind: 'shield' };

export class InventoryHud {
  private open = false;
  private readonly root: HTMLElement;
  private readonly loadoutRoot: HTMLElement;
  private readonly operatorNameEl: HTMLElement;
  private readonly kdEl: HTMLElement;
  private readonly unitsEl: HTMLElement;
  private readonly meleeRow: HTMLElement;
  private readonly meleeNameEl: HTMLElement;
  private readonly shieldRow: HTMLElement;
  private readonly shieldCountEl: HTMLElement;
  private readonly examineTooltip: HTMLElement;
  private readonly weaponSlots: HTMLElement[] = [];
  private dropHoldTarget: DropTarget | null = null;
  private dropHoldStart = 0;
  private dropRafId = 0;
  private examineHideTimer = 0;
  private hoveredDropTarget: DropTarget | null = null;
  private shieldDroppable = false;
  private onWeaponDropRequest: ((slotIndex: number) => void) | null = null;
  private onShieldDropRequest: (() => void) | null = null;
  private onWeaponEquipRequest: ((slotIndex: number) => void) | null = null;
  private onMeleeEquipRequest: (() => void) | null = null;
  private slotOccupied: boolean[] = [];
  private slotWeaponIds: (WeaponId | null)[] = [];

  constructor(weaponOrder: readonly { id: WeaponId; name: string }[]) {
    this.root = document.getElementById('inventory-overlay')!;
    this.loadoutRoot = document.getElementById('inventory-loadout')!;
    this.operatorNameEl = document.getElementById('inventory-operator-name')!;
    this.kdEl = document.getElementById('inventory-kd')!;
    this.unitsEl = document.getElementById('inventory-units')!;
    this.meleeRow = document.getElementById('inventory-melee-row')!;
    this.meleeNameEl = document.getElementById('inventory-melee-name')!;
    this.shieldRow = document.getElementById('inventory-shield-row')!;
    this.shieldCountEl = document.getElementById('inventory-shield-count')!;
    this.examineTooltip = document.getElementById('inventory-examine-tooltip')!;

    for (let i = 0; i < weaponOrder.length; i++) {
      const weapon = weaponOrder[i]!;
      const slot = document.createElement('div');
      slot.className = 'inventory-slot-frame inventory-weapon-slot';
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

      slot.addEventListener('mouseenter', () => {
        this.hoveredDropTarget = this.slotOccupied[i]
          ? { kind: 'weapon', slotIndex: i }
          : null;
      });
      slot.addEventListener('mouseleave', () => {
        if (this.hoveredDropTarget?.kind === 'weapon' && this.hoveredDropTarget.slotIndex === i) {
          this.hoveredDropTarget = null;
        }
        if (this.dropHoldTarget?.kind === 'weapon' && this.dropHoldTarget.slotIndex === i) {
          this.cancelDropHold();
        }
      });
      slot.addEventListener('click', (event) => {
        if (!this.open || !this.slotOccupied[i] || event.button !== 0) return;
        this.onWeaponEquipRequest?.(i);
      });
      slot.addEventListener('contextmenu', (event) => {
        if (!this.open || !this.slotOccupied[i]) return;
        event.preventDefault();
        const weaponId = this.slotWeaponIds[i];
        if (weaponId) this.showExamine(weaponId);
      });

      const ring = slot.querySelector('.inventory-drop-ring-fill') as SVGCircleElement;
      ring.style.strokeDasharray = String(DROP_RING_CIRCUMFERENCE);
      ring.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);

      this.loadoutRoot.appendChild(slot);
      this.weaponSlots.push(slot);
      this.slotOccupied.push(false);
      this.slotWeaponIds.push(null);
    }

    const shieldIcon = document.getElementById('inventory-shield-icon') as HTMLImageElement;
    shieldIcon.src = SHIELD_CHARGE_ICON_SRC;

    const meleeIcon = document.getElementById('inventory-melee-icon') as HTMLImageElement;
    meleeIcon.src = WEAPON_ICON_SRC.katana;

    const shieldRing = this.shieldRow.querySelector(
      '.inventory-drop-ring-fill',
    ) as SVGCircleElement;
    shieldRing.style.strokeDasharray = String(DROP_RING_CIRCUMFERENCE);
    shieldRing.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);

    this.shieldRow.addEventListener('mouseenter', () => {
      this.hoveredDropTarget = this.shieldDroppable ? { kind: 'shield' } : null;
    });
    this.shieldRow.addEventListener('mouseleave', () => {
      if (this.hoveredDropTarget?.kind === 'shield') {
        this.hoveredDropTarget = null;
      }
      if (this.dropHoldTarget?.kind === 'shield') {
        this.cancelDropHold();
      }
    });
    this.shieldRow.addEventListener('contextmenu', (event) => {
      if (!this.open) return;
      event.preventDefault();
      this.showExamineShield();
    });

    this.meleeRow.addEventListener('click', (event) => {
      if (!this.open || event.button !== 0) return;
      this.onMeleeEquipRequest?.();
    });
    this.meleeRow.addEventListener('contextmenu', (event) => {
      if (!this.open) return;
      event.preventDefault();
      this.showExamine('katana');
    });
  }

  setOnWeaponDropRequest(handler: (slotIndex: number) => void): void {
    this.onWeaponDropRequest = handler;
  }

  setOnShieldDropRequest(handler: () => void): void {
    this.onShieldDropRequest = handler;
  }

  setOnWeaponEquipRequest(handler: (slotIndex: number) => void): void {
    this.onWeaponEquipRequest = handler;
  }

  setOnMeleeEquipRequest(handler: () => void): void {
    this.onMeleeEquipRequest = handler;
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
      this.hideExamine();
      this.hoveredDropTarget = null;
    }
  }

  update(state: InventoryViewState, dropKeyHeld = false): void {
    this.operatorNameEl.textContent = state.operatorName;
    this.kdEl.textContent = state.killDeath;
    this.unitsEl.textContent = String(state.unitsInField);

    for (let i = 0; i < state.weapons.length; i++) {
      const weapon = state.weapons[i]!;
      const slot = this.weaponSlots[i];
      if (!slot) continue;

      this.slotOccupied[i] = weapon.occupied;
      this.slotWeaponIds[i] = weapon.weaponId;
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

    this.meleeRow.classList.toggle('active', state.melee.active);
    this.meleeNameEl.textContent = state.melee.name;

    this.shieldDroppable = state.shieldCharges > 0;
    this.shieldRow.classList.toggle('droppable', this.shieldDroppable);
    this.shieldCountEl.textContent = String(state.shieldCharges);

    if (dropKeyHeld && this.hoveredDropTarget) {
      this.syncDropHold(this.hoveredDropTarget);
    } else {
      this.cancelDropHold();
    }
  }

  private syncDropHold(target: DropTarget): void {
    if (target.kind === 'weapon' && !this.slotOccupied[target.slotIndex]) {
      this.cancelDropHold();
      return;
    }
    if (target.kind === 'shield' && !this.shieldDroppable) {
      this.cancelDropHold();
      return;
    }

    if (
      this.dropHoldTarget?.kind !== target.kind ||
      (target.kind === 'weapon' &&
        this.dropHoldTarget?.kind === 'weapon' &&
        this.dropHoldTarget.slotIndex !== target.slotIndex)
    ) {
      this.startDropHold(target);
      return;
    }

    if (!this.dropHoldStart) {
      this.startDropHold(target);
    }
  }

  private startDropHold(target: DropTarget): void {
    this.cancelDropHold();
    this.dropHoldTarget = target;
    this.dropHoldStart = performance.now();
    this.tickDropHold();
  }

  private getDropHost(target: DropTarget): HTMLElement | null {
    if (target.kind === 'shield') return this.shieldRow;
    return this.weaponSlots[target.slotIndex] ?? null;
  }

  private setDropOverlayVisible(target: DropTarget, visible: boolean): void {
    const host = this.getDropHost(target);
    if (!host) return;

    const overlay = host.querySelector('.inventory-drop-overlay') as HTMLElement | null;
    if (visible) {
      overlay?.removeAttribute('hidden');
      host.classList.add('dropping');
    } else {
      overlay?.setAttribute('hidden', '');
      host.classList.remove('dropping');
      const ring = host.querySelector('.inventory-drop-ring-fill') as SVGCircleElement | null;
      if (ring) {
        ring.style.strokeDashoffset = String(DROP_RING_CIRCUMFERENCE);
      }
    }
  }

  private tickDropHold = (): void => {
    if (!this.dropHoldTarget) return;

    const elapsed = performance.now() - this.dropHoldStart;
    const showUi = elapsed >= DROP_UI_DELAY_MS;
    const host = this.getDropHost(this.dropHoldTarget);

    if (showUi) {
      this.setDropOverlayVisible(this.dropHoldTarget, true);

      const uiElapsed = elapsed - DROP_UI_DELAY_MS;
      const uiDuration = DROP_HOLD_MS - DROP_UI_DELAY_MS;
      const progress = Math.min(1, uiElapsed / uiDuration);
      const remaining = Math.max(0, DROP_HOLD_MS - elapsed) / 1000;

      const timerEl = host?.querySelector('.inventory-drop-timer');
      if (timerEl) {
        timerEl.textContent = `Dropping in ${remaining.toFixed(1)}s`;
      }

      const ring = host?.querySelector('.inventory-drop-ring-fill') as SVGCircleElement | null;
      if (ring) {
        ring.style.strokeDashoffset = String(
          DROP_RING_CIRCUMFERENCE * (1 - progress),
        );
      }
    } else {
      this.setDropOverlayVisible(this.dropHoldTarget, false);
    }

    if (elapsed >= DROP_HOLD_MS) {
      const target = this.dropHoldTarget;
      this.cancelDropHold();
      if (target?.kind === 'weapon') {
        this.onWeaponDropRequest?.(target.slotIndex);
      } else if (target?.kind === 'shield') {
        this.onShieldDropRequest?.();
      }
      return;
    }

    this.dropRafId = requestAnimationFrame(this.tickDropHold);
  };

  private cancelDropHold(): void {
    if (this.dropRafId) {
      cancelAnimationFrame(this.dropRafId);
      this.dropRafId = 0;
    }

    if (this.dropHoldTarget) {
      this.setDropOverlayVisible(this.dropHoldTarget, false);
    }

    this.dropHoldTarget = null;
    this.dropHoldStart = 0;
  }

  private showExamine(weaponId: WeaponId): void {
    const config = getWeaponConfig(weaponId);
    if (!config) return;

    this.examineTooltip.innerHTML = `
      <div class="inventory-examine-title">${config.name}</div>
      <div class="inventory-examine-meta">Damage ${config.damage}</div>
    `;
    this.examineTooltip.hidden = false;
    this.scheduleExamineHide();
  }

  private showExamineShield(): void {
    this.examineTooltip.innerHTML = `
      <div class="inventory-examine-title">Shield Charge</div>
      <div class="inventory-examine-meta">Restores shield protection</div>
    `;
    this.examineTooltip.hidden = false;
    this.scheduleExamineHide();
  }

  private scheduleExamineHide(): void {
    if (this.examineHideTimer) {
      window.clearTimeout(this.examineHideTimer);
    }
    this.examineHideTimer = window.setTimeout(() => this.hideExamine(), EXAMINE_HIDE_MS);
  }

  private hideExamine(): void {
    if (this.examineHideTimer) {
      window.clearTimeout(this.examineHideTimer);
      this.examineHideTimer = 0;
    }
    this.examineTooltip.hidden = true;
    this.examineTooltip.textContent = '';
  }
}
