import {
  DEFAULT_SHIELD_CHARGES,
  MAX_SHIELD_CHARGES,
} from '../../shared/inventory/inventoryLimits';

export class PlayerInventory {
  private shieldCharges = DEFAULT_SHIELD_CHARGES;

  getShieldCharges(): number {
    return this.shieldCharges;
  }

  setShieldCharges(count: number): void {
    this.shieldCharges = Math.max(
      0,
      Math.min(MAX_SHIELD_CHARGES, Math.floor(count)),
    );
  }

  isShieldFull(): boolean {
    return this.shieldCharges >= MAX_SHIELD_CHARGES;
  }
}
