import type { WeaponId } from '../../shared/content/weaponIds';
import {
  DEFAULT_SHIELD_CHARGES,
  MAX_SHIELD_CHARGES,
} from '../../shared/inventory/inventoryLimits';

export const WEAPON_ICON_SRC: Record<WeaponId, string> = {
  pistol: '/images/pistol_icon_1.png',
  plasma_rifle: '/images/rifle_icon_1.png',
  sniper_rifle: '/images/sniper_icon_1.png',
  root_bio_carbine: '/images/root_bio_carbine_icon.png',
  bio_liquid_rifle: '/images/bio_liquid_rifle_icon.png',
  bio_machine_gun: '/images/bio_machine_gun.png',
  plasma_shotgun: '/images/plasma_shotgun_icon.png',
  katana: '/images/katana_melee_icon_1.png',
};

export const SHIELD_CHARGE_ICON_SRC = '/images/shield_charge_icon_1.png';

export { DEFAULT_SHIELD_CHARGES, MAX_SHIELD_CHARGES };
