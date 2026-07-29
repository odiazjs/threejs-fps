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

/** Fired from `update` when a shell-style reload inserts a round or finishes. */
export interface ShellReloadUpdate {
  readonly shellInserted: boolean;
  readonly magazineFull: boolean;
  readonly finished: boolean;
}

function isShellReload(config: WeaponConfig): boolean {
  return config.reloadStyle === 'shell';
}

export class WeaponAmmo {
  private clip: number;
  private reserveRounds: number;
  private reloading = false;
  /** Magazine reload: seconds left until the whole mag is filled. */
  private reloadRemaining = 0;
  private reloadRoundsNeeded = 0;
  /** Shell reload: seconds left until the next shell inserts. */
  private shellTimer = 0;
  private shellDuration = 0;
  private shellsPlanned = 0;
  private shellsLoadedThisReload = 0;
  private lastShellUpdate: ShellReloadUpdate | null = null;

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
      if (isShellReload(config)) {
        this.shellDuration = this.computeShellDuration();
        this.shellTimer = Math.min(this.shellTimer, this.shellDuration);
      } else {
        this.reloadRemaining = Math.min(this.reloadRemaining, config.reloadSec);
      }
    }
  }

  refill(reserveRounds = PLAYER_START_RESERVE_ROUNDS): void {
    this.clip = this.config.clipSize;
    this.reserveRounds = reserveRounds;
    this.clearReloadState();
  }

  /** Full magazine only — no reserve (Plasma Harvest craft). */
  setMagazineOnly(): void {
    this.clip = this.config.clipSize;
    this.reserveRounds = 0;
    this.clearReloadState();
  }

  private roundsToFillClip(): number {
    return this.config.clipSize - this.clip;
  }

  private computeShellDuration(): number {
    const mag = Math.max(1, this.config.clipSize);
    return Math.max(0.05, this.config.reloadSec / mag);
  }

  private clearReloadState(): void {
    this.reloading = false;
    this.reloadRemaining = 0;
    this.reloadRoundsNeeded = 0;
    this.shellTimer = 0;
    this.shellDuration = 0;
    this.shellsPlanned = 0;
    this.shellsLoadedThisReload = 0;
  }

  isShellReloadStyle(): boolean {
    return isShellReload(this.config);
  }

  isReloading(): boolean {
    return this.reloading;
  }

  getClip(): number {
    return this.clip;
  }

  /** Planned duration for the current reload sequence (network / remote anim). */
  getReloadSequenceDuration(): number {
    if (!this.reloading) return 0;
    if (isShellReload(this.config)) {
      const remainingShells = Math.max(0, this.shellsPlanned - this.shellsLoadedThisReload);
      return remainingShells * this.shellDuration;
    }
    return this.reloadRemaining;
  }

  consumeShellReloadUpdate(): ShellReloadUpdate | null {
    const update = this.lastShellUpdate;
    this.lastShellUpdate = null;
    return update;
  }

  getState(): AmmoState {
    const { clipSize, reloadSec } = this.config;
    const canReload = this.canReload();
    const outOfAmmo =
      this.clip <= 0 && !canReload && !this.reloading;

    let reloadProgress = 0;
    if (this.reloading) {
      if (isShellReload(this.config) && this.shellsPlanned > 0) {
        const shellProgress =
          this.shellDuration > 0
            ? 1 - Math.max(0, this.shellTimer) / this.shellDuration
            : 1;
        reloadProgress =
          (this.shellsLoadedThisReload + Math.min(1, Math.max(0, shellProgress))) /
          this.shellsPlanned;
      } else {
        const safeReloadSec = Math.max(reloadSec, 0.001);
        reloadProgress = 1 - this.reloadRemaining / safeReloadSec;
      }
    }

    return {
      clip: this.clip,
      clipSize,
      reserveRounds: this.reserveRounds,
      reloading: this.reloading,
      reloadProgress,
      outOfAmmo,
      canReload,
    };
  }

  update(delta: number): void {
    this.lastShellUpdate = null;
    if (!this.reloading) return;

    if (isShellReload(this.config)) {
      this.updateShellReload(delta);
      return;
    }

    this.reloadRemaining -= delta;
    if (this.reloadRemaining > 0) return;

    this.reloading = false;
    this.reloadRemaining = 0;
    this.clip += this.reloadRoundsNeeded;
    this.reserveRounds = Math.max(0, this.reserveRounds - this.reloadRoundsNeeded);
    this.reloadRoundsNeeded = 0;
  }

  private updateShellReload(delta: number): void {
    this.shellTimer -= delta;
    if (this.shellTimer > 0) return;

    // Insert one shell from reserve.
    this.clip += 1;
    this.reserveRounds = Math.max(0, this.reserveRounds - 1);
    this.shellsLoadedThisReload += 1;

    const magazineFull = this.clip >= this.config.clipSize;
    const sequenceDone =
      magazineFull ||
      this.reserveRounds <= 0 ||
      this.shellsLoadedThisReload >= this.shellsPlanned;

    this.lastShellUpdate = {
      shellInserted: true,
      magazineFull,
      finished: sequenceDone,
    };

    if (sequenceDone) {
      this.clearReloadState();
      return;
    }

    this.shellTimer = this.shellDuration;
  }

  canShoot(): boolean {
    if (this.config.fireMode === 'melee') return true;
    if (this.clip <= 0) return false;
    // Shell reloads can be interrupted to fire loaded rounds.
    if (isShellReload(this.config)) return true;
    return !this.reloading;
  }

  tryShoot(): boolean {
    if (this.config.fireMode === 'melee') return true;
    if (!this.canShoot()) return false;
    if (this.reloading && isShellReload(this.config)) {
      this.cancelReload();
    }
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

    if (isShellReload(this.config)) {
      this.shellsPlanned = Math.min(this.roundsToFillClip(), this.reserveRounds);
      if (this.shellsPlanned <= 0) return false;
      this.shellsLoadedThisReload = 0;
      this.shellDuration = this.computeShellDuration();
      this.shellTimer = this.shellDuration;
      this.reloading = true;
      return true;
    }

    this.reloadRoundsNeeded = Math.min(this.roundsToFillClip(), this.reserveRounds);
    this.reloading = true;
    this.reloadRemaining = Math.max(this.config.reloadSec, 0.05);
    return true;
  }

  cancelReload(): void {
    if (!this.reloading) return;
    this.clearReloadState();
  }

  addReserveClip(): void {
    this.reserveRounds += this.config.clipSize;
  }
}
