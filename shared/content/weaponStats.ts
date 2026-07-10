import type { WeaponId } from './weaponIds.js';
import type { WeaponFireMode } from './weaponConfig.js';

export const WEAPON_DAMAGE: Record<WeaponId, number> = {
  plasma_rifle: 7,
  pistol: 11,
  sniper_rifle: 90,
  root_bio_carbine: 8,
  bio_liquid_rifle: 16,
  katana: 44,
};

export const WEAPON_RELOAD_SEC: Record<WeaponId, number> = {
  plasma_rifle: 2.0,
  pistol: 1.5,
  sniper_rifle: 2.75,
  root_bio_carbine: 1.9,
  bio_liquid_rifle: 1.9,
  katana: 0,
};

export const WEAPON_MAX_HIT_DISTANCE: Record<WeaponId, number> = {
  plasma_rifle: 75,
  pistol: 75,
  sniper_rifle: 220,
  root_bio_carbine: 80,
  bio_liquid_rifle: 70,
  katana: 2.8,
};

export const WEAPON_FIRE_MODE: Record<WeaponId, WeaponFireMode> = {
  plasma_rifle: 'auto',
  pistol: 'semi',
  sniper_rifle: 'semi',
  root_bio_carbine: 'burst',
  bio_liquid_rifle: 'auto',
  katana: 'melee',
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
