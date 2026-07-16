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
  grenadeCount: number;
  grenadeEquipped: boolean;
  operatorName: string;
  killDeath: string;
  unitsInField: number;
}

const EXAMINE_HIDE_MS = 2400;
const PANEL_CLOSE_MS = 280;
/** Pixels of movement before a press becomes a drag (not a click-to-equip). */
const DRAG_THRESHOLD_PX = 8;

const SLOT_LABELS = ['Primary Weapon', 'Secondary Weapon', 'Tertiary Weapon'] as const;

type DragKind = { kind: 'weapon'; slotIndex: number } | { kind: 'shield' };

export class InventoryHud {
  private open = false;
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly loadoutRoot: HTMLElement;
  private readonly operatorNameEl: HTMLElement;
  private readonly kdEl: HTMLElement;
  private readonly unitsEl: HTMLElement;
  private readonly meleeRow: HTMLElement;
  private readonly meleeNameEl: HTMLElement;
  private readonly shieldRow: HTMLElement;
  private readonly shieldCountEl: HTMLElement;
  private readonly grenadeRow: HTMLElement;
  private readonly grenadeCountEl: HTMLElement;
  private readonly examineTooltip: HTMLElement;
  private readonly weaponSlots: HTMLElement[] = [];
  private readonly dragGhost: HTMLElement;
  private examineHideTimer = 0;
  private closeTimer = 0;
  private shieldDroppable = false;
  private onWeaponDropRequest: ((slotIndex: number) => void) | null = null;
  private onShieldDropRequest: (() => void) | null = null;
  private onWeaponEquipRequest: ((slotIndex: number) => void) | null = null;
  private onMeleeEquipRequest: (() => void) | null = null;
  private onCloseRequest: (() => void) | null = null;
  private slotOccupied: boolean[] = [];
  private slotWeaponIds: (WeaponId | null)[] = [];
  private slotNames: string[] = [];

  private dragPointerId: number | null = null;
  private dragKind: DragKind | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragActive = false;
  private suppressNextClick = false;
  private dragSourceEl: HTMLElement | null = null;

  constructor(weaponOrder: readonly { id: WeaponId; name: string }[]) {
    this.root = document.getElementById('inventory-overlay')!;
    this.panel = document.getElementById('inventory-panel')!;
    this.loadoutRoot = document.getElementById('inventory-loadout')!;
    this.operatorNameEl = document.getElementById('inventory-operator-name')!;
    this.kdEl = document.getElementById('inventory-kd')!;
    this.unitsEl = document.getElementById('inventory-units')!;
    this.meleeRow = document.getElementById('inventory-melee-row')!;
    this.meleeNameEl = document.getElementById('inventory-melee-name')!;
    this.shieldRow = document.getElementById('inventory-shield-row')!;
    this.shieldCountEl = document.getElementById('inventory-shield-count')!;
    this.grenadeRow = document.getElementById('inventory-grenade-row')!;
    this.grenadeCountEl = document.getElementById('inventory-grenade-count')!;
    this.examineTooltip = document.getElementById('inventory-examine-tooltip')!;

    this.dragGhost = document.createElement('div');
    this.dragGhost.className = 'inventory-drag-ghost';
    this.dragGhost.hidden = true;
    this.root.appendChild(this.dragGhost);

    for (let i = 0; i < weaponOrder.length; i++) {
      const weapon = weaponOrder[i]!;
      const label = SLOT_LABELS[i] ?? `Weapon ${i + 1}`;
      const slot = document.createElement('div');
      slot.className = 'inventory-card inventory-weapon-slot';
      slot.dataset.slotIndex = String(i);
      slot.innerHTML = `
        <div class="inventory-card-label">${label}</div>
        <div class="inventory-slot-key">${i + 1}</div>
        <div class="inventory-icon-wrap">
          <img class="inventory-weapon-icon" src="${WEAPON_ICON_SRC[weapon.id]}" alt="" />
        </div>
        <div class="inventory-weapon-name">${weapon.name}</div>
      `;

      slot.addEventListener('pointerdown', (event) => {
        if (!this.open || event.button !== 0 || !this.slotOccupied[i]) return;
        this.beginDrag(event, { kind: 'weapon', slotIndex: i }, slot);
      });
      slot.addEventListener('click', (event) => {
        if (!this.open || !this.slotOccupied[i] || event.button !== 0) return;
        if (this.suppressNextClick) {
          this.suppressNextClick = false;
          return;
        }
        this.onWeaponEquipRequest?.(i);
      });
      slot.addEventListener('contextmenu', (event) => {
        if (!this.open || !this.slotOccupied[i]) return;
        event.preventDefault();
        const weaponId = this.slotWeaponIds[i];
        if (weaponId) this.showExamine(weaponId);
      });

      this.loadoutRoot.appendChild(slot);
      this.weaponSlots.push(slot);
      this.slotOccupied.push(false);
      this.slotWeaponIds.push(null);
      this.slotNames.push(weapon.name);
    }

    const shieldIcon = document.getElementById('inventory-shield-icon') as HTMLImageElement;
    shieldIcon.src = SHIELD_CHARGE_ICON_SRC;

    const meleeIcon = document.getElementById('inventory-melee-icon') as HTMLImageElement;
    meleeIcon.src = WEAPON_ICON_SRC.katana;

    this.shieldRow.addEventListener('pointerdown', (event) => {
      if (!this.open || event.button !== 0 || !this.shieldDroppable) return;
      this.beginDrag(event, { kind: 'shield' }, this.shieldRow);
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

    this.root.querySelector('.inventory-backdrop')?.addEventListener('click', () => {
      if (!this.open || this.dragKind) return;
      this.onCloseRequest?.();
    });

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  setOnCloseRequest(handler: (() => void) | null): void {
    this.onCloseRequest = handler;
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
    if (open === this.open) return;
    this.open = open;

    if (this.closeTimer) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = 0;
    }

    if (open) {
      this.root.hidden = false;
      void this.root.offsetWidth;
      this.root.classList.add('is-open');
    } else {
      this.root.classList.remove('is-open');
      this.cancelDrag();
      this.hideExamine();
      this.closeTimer = window.setTimeout(() => {
        if (!this.open) this.root.hidden = true;
        this.closeTimer = 0;
      }, PANEL_CLOSE_MS);
    }
  }

  update(state: InventoryViewState): void {
    this.operatorNameEl.textContent = state.operatorName;
    this.kdEl.textContent = state.killDeath;
    this.unitsEl.textContent = String(state.unitsInField);

    for (let i = 0; i < state.weapons.length; i++) {
      const weapon = state.weapons[i]!;
      const slot = this.weaponSlots[i];
      if (!slot) continue;

      this.slotOccupied[i] = weapon.occupied;
      this.slotWeaponIds[i] = weapon.weaponId;
      this.slotNames[i] = weapon.occupied ? weapon.name : 'Empty';
      slot.classList.toggle('active', weapon.active);
      slot.classList.toggle('empty', !weapon.occupied);
      slot.classList.toggle('droppable', weapon.occupied);

      const nameEl = slot.querySelector('.inventory-weapon-name');
      if (nameEl) nameEl.textContent = weapon.occupied ? weapon.name : 'Empty';

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
    this.shieldRow.classList.toggle('empty', state.shieldCharges <= 0);
    this.shieldCountEl.textContent = String(state.shieldCharges);

    this.grenadeRow.classList.toggle('active', state.grenadeEquipped);
    this.grenadeRow.classList.toggle('empty', state.grenadeCount <= 0);
    this.grenadeCountEl.textContent = String(state.grenadeCount);
  }

  private beginDrag(event: PointerEvent, kind: DragKind, sourceEl: HTMLElement): void {
    if (this.dragPointerId !== null) return;

    this.dragPointerId = event.pointerId;
    this.dragKind = kind;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragActive = false;
    this.dragSourceEl = sourceEl;
    this.suppressNextClick = false;

    try {
      sourceEl.setPointerCapture(event.pointerId);
    } catch {
      // Capture optional — window listeners still track the drag.
    }
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId || !this.dragKind) {
      return;
    }

    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    if (!this.dragActive && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      this.activateDrag();
    }
    if (!this.dragActive) return;

    this.positionGhost(event.clientX, event.clientY);
    const overScene = this.isOverDropZone(event.clientX, event.clientY);
    this.root.classList.toggle('is-drag-drop-ready', overScene);
    this.dragGhost.classList.toggle('is-drop-ready', overScene);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) return;

    const kind = this.dragKind;
    const wasDragging = this.dragActive;
    const overScene = wasDragging && this.isOverDropZone(event.clientX, event.clientY);

    this.endDragVisuals();

    if (wasDragging && kind && overScene) {
      this.suppressNextClick = true;
      if (kind.kind === 'weapon') {
        this.onWeaponDropRequest?.(kind.slotIndex);
      } else {
        this.onShieldDropRequest?.();
      }
    } else if (wasDragging) {
      // Drag cancelled back onto the panel — don't equip.
      this.suppressNextClick = true;
    }

    this.dragPointerId = null;
    this.dragKind = null;
    this.dragActive = false;
    this.dragSourceEl = null;
  };

  private activateDrag(): void {
    if (!this.dragKind || !this.dragSourceEl) return;
    this.dragActive = true;
    this.suppressNextClick = true;
    this.root.classList.add('is-dragging');
    this.dragSourceEl.classList.add('is-drag-source');
    this.populateGhost(this.dragKind);
    this.dragGhost.hidden = false;
    this.hideExamine();
  }

  private populateGhost(kind: DragKind): void {
    if (kind.kind === 'weapon') {
      const weaponId = this.slotWeaponIds[kind.slotIndex];
      const name = this.slotNames[kind.slotIndex] ?? 'Weapon';
      const iconSrc = weaponId ? WEAPON_ICON_SRC[weaponId] : '';
      this.dragGhost.innerHTML = `
        <div class="inventory-drag-ghost-icon">
          ${iconSrc ? `<img src="${iconSrc}" alt="" />` : ''}
        </div>
        <div class="inventory-drag-ghost-label">${name}</div>
        <div class="inventory-drag-ghost-hint">Drop to discard</div>
      `;
      return;
    }

    this.dragGhost.innerHTML = `
      <div class="inventory-drag-ghost-icon">
        <img src="${SHIELD_CHARGE_ICON_SRC}" alt="" />
      </div>
      <div class="inventory-drag-ghost-label">Shield Charge</div>
      <div class="inventory-drag-ghost-hint">Drop to discard</div>
    `;
  }

  private positionGhost(clientX: number, clientY: number): void {
    this.dragGhost.style.transform = `translate(${clientX}px, ${clientY}px) translate(-50%, -50%)`;
  }

  private isOverDropZone(clientX: number, clientY: number): boolean {
    const panelRect = this.panel.getBoundingClientRect();
    return (
      clientX < panelRect.left ||
      clientX > panelRect.right ||
      clientY < panelRect.top ||
      clientY > panelRect.bottom
    );
  }

  private endDragVisuals(): void {
    this.root.classList.remove('is-dragging', 'is-drag-drop-ready');
    this.dragGhost.hidden = true;
    this.dragGhost.classList.remove('is-drop-ready');
    this.dragGhost.innerHTML = '';
    this.dragSourceEl?.classList.remove('is-drag-source');
  }

  private cancelDrag(): void {
    if (this.dragPointerId !== null && this.dragSourceEl) {
      try {
        this.dragSourceEl.releasePointerCapture(this.dragPointerId);
      } catch {
        // Already released.
      }
    }
    this.endDragVisuals();
    this.dragPointerId = null;
    this.dragKind = null;
    this.dragActive = false;
    this.dragSourceEl = null;
    this.suppressNextClick = false;
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
