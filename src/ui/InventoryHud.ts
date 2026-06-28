import type { WeaponId } from '../../shared/content/weaponIds';
import { SHIELD_CHARGE_ICON_SRC, WEAPON_ICON_SRC } from '../content/inventoryConfig';

export interface InventoryWeaponEntry {
  slotIndex: number;
  weaponId: WeaponId;
  name: string;
  active: boolean;
}

export interface InventoryViewState {
  weapons: readonly InventoryWeaponEntry[];
  shieldCharges: number;
}

export class InventoryHud {
  private open = false;
  private readonly root: HTMLElement;
  private readonly loadoutRoot: HTMLElement;
  private readonly shieldCountEl: HTMLElement;
  private readonly weaponSlots: HTMLElement[] = [];

  constructor(weaponOrder: readonly { id: WeaponId; name: string }[]) {
    this.root = document.getElementById('inventory-overlay')!;
    this.loadoutRoot = document.getElementById('inventory-loadout')!;
    this.shieldCountEl = document.getElementById('inventory-shield-count')!;

    for (let i = 0; i < weaponOrder.length; i++) {
      const weapon = weaponOrder[i]!;
      const slot = document.createElement('div');
      slot.className = 'inventory-weapon-slot';
      slot.innerHTML = `
        <div class="inventory-slot-key">${i + 1}</div>
        <div class="inventory-icon-wrap">
          <img class="inventory-weapon-icon" src="${WEAPON_ICON_SRC[weapon.id]}" alt="" />
        </div>
        <div class="inventory-weapon-name">${weapon.name}</div>
      `;
      this.loadoutRoot.appendChild(slot);
      this.weaponSlots.push(slot);
    }

    const shieldIcon = document.getElementById('inventory-shield-icon') as HTMLImageElement;
    shieldIcon.src = SHIELD_CHARGE_ICON_SRC;
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
  }

  update(state: InventoryViewState): void {
    for (let i = 0; i < state.weapons.length; i++) {
      const weapon = state.weapons[i]!;
      const slot = this.weaponSlots[i];
      if (!slot) continue;
      slot.classList.toggle('active', weapon.active);
      const nameEl = slot.querySelector('.inventory-weapon-name');
      if (nameEl) nameEl.textContent = weapon.name;
    }

    this.shieldCountEl.textContent = String(state.shieldCharges);
  }
}
