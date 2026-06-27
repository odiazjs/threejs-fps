import type { WeaponId } from './weaponIds.js';

export const WEAPON_DAMAGE: Record<WeaponId, number> = {
  plasma_rifle: 7,
  pistol: 11,
  sniper_rifle: 90,
};

export const WEAPON_RELOAD_SEC: Record<WeaponId, number> = {
  plasma_rifle: 2.0,
  pistol: 1.5,
  sniper_rifle: 2.75,
};

export const WEAPON_MAX_HIT_DISTANCE: Record<WeaponId, number> = {
  plasma_rifle: 75,
  pistol: 75,
  sniper_rifle: 220,
};

/** Reserve rounds each weapon starts with and regains on respawn. */
export const PLAYER_START_RESERVE_ROUNDS = 300;

export function getWeaponDamage(weaponId: WeaponId): number {
  return WEAPON_DAMAGE[weaponId];
}

export function getWeaponReloadSec(weaponId: WeaponId): number {
  return WEAPON_RELOAD_SEC[weaponId];
}

export function getWeaponMaxHitDistance(weaponId: WeaponId): number {
  return WEAPON_MAX_HIT_DISTANCE[weaponId];
}
