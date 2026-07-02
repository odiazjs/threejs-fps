import type { WeaponShotSoundPhase } from '../content/weaponConfig.js';

/** Broadcast when a player fires — observers play spatial weapon SFX. */
export interface WeaponShotSoundMessage {
  shooterId: string;
  weaponId: string;
  x: number;
  y: number;
  z: number;
  phase: WeaponShotSoundPhase;
}
