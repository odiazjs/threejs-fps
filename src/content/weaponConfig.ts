import type { WeaponConfig } from '../../shared/content/weaponConfig';
import { PLASMA_RIFLE_DAMAGE } from '../../shared/combat/damage';

export type { WeaponConfig };

export const PLASMA_RIFLE_CONFIG: WeaponConfig = {
  clipSize: 30,
  reloadSec: 3,
  reserveClips: 3,
  fireRate: 10,
  damage: PLASMA_RIFLE_DAMAGE,
};
