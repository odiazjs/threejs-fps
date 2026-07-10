import type { WeaponConfig } from '../../shared/content/weaponConfig';
import { PLAYER_START_RESERVE_ROUNDS } from '../../shared/content/weaponStats';

export interface AmmoState {
  clip: number;
  clipSize: number;
  reserveRounds: number;
  reloading: boolean;
  reloadProgress: number;
  outOfAmmo: boolean;
  canReload: boolean;
}

export class WeaponAmmo {
  private clip: number;
  private reserveRounds: number;
  private reloading = false;
  private reloadRemaining = 0;
  private reloadRoundsNeeded = 0;

  constructor(private config: WeaponConfig) {
    this.refill();
  }

  /** Apply Armory effective clip/reload without wiping reserve. */
  applyConfig(config: WeaponConfig): void {
    const prevSize = this.config.clipSize;
    const wasFull = this.clip >= prevSize;
    this.config = config;
    if (wasFull || this.clip > config.clipSize) {
      this.clip = config.clipSize;
    }
    if (this.reloading) {
      this.reloadRemaining = Math.min(this.reloadRemaining, config.reloadSec);
    }
  }

  refill(reserveRounds = PLAYER_START_RESERVE_ROUNDS): void {
    this.clip = this.config.clipSize;
    this.reserveRounds = reserveRounds;
    this.reloading = false;
    this.reloadRemaining = 0;
    this.reloadRoundsNeeded = 0;
  }

  private roundsToFillClip(): number {
    return this.config.clipSize - this.clip;
  }

  getState(): AmmoState {
    const { clipSize, reloadSec } = this.config;
    const canReload = this.canReload();
    const outOfAmmo =
      this.clip <= 0 && !canReload && !this.reloading;

    return {
      clip: this.clip,
      clipSize,
      reserveRounds: this.reserveRounds,
      reloading: this.reloading,
      reloadProgress: this.reloading
        ? 1 - this.reloadRemaining / reloadSec
        : 0,
      outOfAmmo,
      canReload,
    };
  }

  update(delta: number): void {
    if (!this.reloading) return;

    this.reloadRemaining -= delta;
    if (this.reloadRemaining > 0) return;

    this.reloading = false;
    this.reloadRemaining = 0;
    this.clip += this.reloadRoundsNeeded;
    this.reserveRounds = Math.max(0, this.reserveRounds - this.reloadRoundsNeeded);
    this.reloadRoundsNeeded = 0;
  }

  canShoot(): boolean {
    if (this.config.fireMode === 'melee') return true;
    return !this.reloading && this.clip > 0;
  }

  tryShoot(): boolean {
    if (this.config.fireMode === 'melee') return true;
    if (!this.canShoot()) return false;
    this.clip -= 1;
    return true;
  }

  canReload(): boolean {
    if (this.config.fireMode === 'melee') return false;
    if (this.reloading) return false;
    if (this.clip >= this.config.clipSize) return false;
    return this.reserveRounds > 0;
  }

  tryReload(): boolean {
    if (!this.canReload()) return false;

    this.reloadRoundsNeeded = Math.min(this.roundsToFillClip(), this.reserveRounds);
    this.reloading = true;
    this.reloadRemaining = this.config.reloadSec;
    return true;
  }

  cancelReload(): void {
    if (!this.reloading) return;
    this.reloading = false;
    this.reloadRemaining = 0;
    this.reloadRoundsNeeded = 0;
  }

  addReserveClip(): void {
    this.reserveRounds += this.config.clipSize;
  }
}
