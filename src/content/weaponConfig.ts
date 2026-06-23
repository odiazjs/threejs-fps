export interface WeaponConfig {
  readonly clipSize: number;
  readonly reloadSec: number;
  readonly reserveClips: number;
  /** Shots per second while holding fire. */
  readonly fireRate: number;
}

export const PLASMA_RIFLE_CONFIG: WeaponConfig = {
  clipSize: 30,
  reloadSec: 3,
  reserveClips: 3,
  fireRate: 10,
};
