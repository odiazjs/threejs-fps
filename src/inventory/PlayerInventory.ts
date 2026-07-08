import {
  DEFAULT_GRENADES,
  DEFAULT_SHIELD_CHARGES,
  MAX_GRENADES,
  MAX_SHIELD_CHARGES,
} from '../../shared/inventory/inventoryLimits';

export class PlayerInventory {
  private shieldCharges = DEFAULT_SHIELD_CHARGES;
  private grenadeCount = DEFAULT_GRENADES;

  getShieldCharges(): number {
    return this.shieldCharges;
  }

  setShieldCharges(count: number): void {
    this.shieldCharges = Math.max(
      0,
      Math.min(MAX_SHIELD_CHARGES, Math.floor(count)),
    );
  }

  getGrenadeCount(): number {
    return this.grenadeCount;
  }

  setGrenadeCount(count: number): void {
    this.grenadeCount = Math.max(
      0,
      Math.min(MAX_GRENADES, Math.floor(count)),
    );
  }

  addGrenades(count: number): number {
    const before = this.grenadeCount;
    this.grenadeCount = Math.min(MAX_GRENADES, this.grenadeCount + Math.max(0, count));
    return this.grenadeCount - before;
  }

  trySpendGrenade(): boolean {
    if (this.grenadeCount <= 0) return false;
    this.grenadeCount -= 1;
    return true;
  }

  isShieldFull(): boolean {
    return this.shieldCharges >= MAX_SHIELD_CHARGES;
  }

  isGrenadeFull(): boolean {
    return this.grenadeCount >= MAX_GRENADES;
  }
}
