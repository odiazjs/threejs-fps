import type { WeaponId } from './weaponIds.js';

export const WEAPON_DAMAGE: Record<WeaponId, number> = {
  plasma_rifle: 3,
  pistol: 16,
};

export const WEAPON_RELOAD_SEC: Record<WeaponId, number> = {
  plasma_rifle: 2.25,
  pistol: 1.6,
};

export function getWeaponDamage(weaponId: WeaponId): number {
  return WEAPON_DAMAGE[weaponId];
}

export function getWeaponReloadSec(weaponId: WeaponId): number {
  return WEAPON_RELOAD_SEC[weaponId];
}
