export interface WeaponConfig {
  readonly clipSize: number;
  readonly reloadSec: number;
  readonly reserveClips: number;
  /** Shots per second while holding fire. */
  readonly fireRate: number;
  readonly damage: number;
}
