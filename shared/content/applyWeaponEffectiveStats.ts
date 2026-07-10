import type { RecoilConfig, WeaponConfig } from './weaponConfig.js';
import {
  SHIPPED_WEAPON_BASE_STATS,
  resolveEffectiveWeaponStats,
  zeroUpgradeLevels,
  type WeaponEffectiveStats,
} from './weaponUpgrades.js';
import type { WeaponId } from './weaponIds.js';

/**
 * Armory recoil stat that maps to 1.0× camera pattern amplitude.
 * Higher recoil → stronger pitch/yaw kicks on the aim rigs.
 */
export const RECOIL_STAT_REFERENCE = 50;

/** Fully upgraded / near-zero Armory recoil still keeps a readable kick. */
const MIN_RECOIL_CAMERA_SCALE = 0.2;
/** Recoil 100 / reference 50 → 2×; allow a little headroom for hot loads. */
const MAX_RECOIL_CAMERA_SCALE = 2.4;

/**
 * Map Armory recoil (0–100) → camera pattern multiplier.
 * Absolute across weapons: 70 recoil kicks harder than 35 on the same pattern shape.
 */
export function recoilCameraKickScale(recoilStat: number): number {
  if (!Number.isFinite(recoilStat) || recoilStat <= 0) return 0;
  return Math.max(
    MIN_RECOIL_CAMERA_SCALE,
    Math.min(MAX_RECOIL_CAMERA_SCALE, recoilStat / RECOIL_STAT_REFERENCE),
  );
}

/** @deprecated Use recoilCameraKickScale — kept for callers that passed weapon id. */
export function recoilPatternScale(
  _weaponId: string,
  stats: WeaponEffectiveStats,
): number {
  return recoilCameraKickScale(stats.recoil);
}

function scaleRecoilConfig(recoil: RecoilConfig, scale: number): RecoilConfig {
  // Pattern shape stays authored; cameraKickScale drives pitch/yaw amplitude in WeaponRecoil.
  // visualKick is scaled here so viewmodel punch tracks the same Armory recoil stat.
  return {
    ...recoil,
    cameraKickScale: scale,
    visualKick: recoil.visualKick * scale,
  };
}

/** Catalog stock effective stats (level 0) — used when Armory data is missing. */
export function shippedEffectiveStats(weaponId: WeaponId): WeaponEffectiveStats {
  return resolveEffectiveWeaponStats(
    SHIPPED_WEAPON_BASE_STATS[weaponId],
    zeroUpgradeLevels(),
  );
}

/**
 * Overlay Armory effective stats onto a base weapon config for match play.
 * Always pass the unmodified catalog config — do not chain on an already-scaled config.
 *
 * Recoil: Armory recoil stat scales the camera pitch/yaw pattern (and viewmodel kick).
 */
export function withEffectiveWeaponStats(
  config: WeaponConfig,
  stats: WeaponEffectiveStats,
): WeaponConfig {
  const recoilScale = recoilCameraKickScale(stats.recoil);

  return {
    ...config,
    damage: stats.damage,
    clipSize: Math.max(1, Math.round(stats.magazineSize)),
    reloadSec: Math.max(0, stats.reloadTime),
    adsTime: Math.max(0.05, stats.adsTime),
    fireRate: Math.max(0, stats.fireRate),
    maxHitDistance: Math.max(0, stats.range),
    meleeRange:
      config.fireMode === 'melee' ? Math.max(0, stats.range) : config.meleeRange,
    recoil: scaleRecoilConfig(config.recoil, recoilScale),
  };
}
