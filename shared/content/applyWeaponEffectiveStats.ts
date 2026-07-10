import type { RecoilConfig, WeaponConfig } from './weaponConfig.js';
import {
  SHIPPED_WEAPON_BASE_STATS,
  WEAPON_UPGRADE_STEP_BY_STAT,
  type WeaponEffectiveStats,
} from './weaponUpgrades.js';
import type { WeaponId } from './weaponIds.js';

/** Fully upgraded / near-zero Armory recoil still keeps a readable kick. */
const MIN_RECOIL_SCALE = 0.25;
/** Armory recoil 100 vs a mid catalog base (~55) → ~1.8×; allow up to 2×. */
const MAX_RECOIL_SCALE = 2;

/**
 * Catalog base recoil intensity (0–100) for a weapon id.
 * Falls back to reconstructing from effective stats when unknown.
 */
function catalogBaseRecoil(weaponId: string, stats: WeaponEffectiveStats): number {
  if (weaponId in SHIPPED_WEAPON_BASE_STATS) {
    const shipped = SHIPPED_WEAPON_BASE_STATS[weaponId as WeaponId].recoil;
    if (shipped > 0) return shipped;
  }
  return Math.max(
    1,
    stats.recoil + stats.levels.recoil * WEAPON_UPGRADE_STEP_BY_STAT.recoil,
  );
}

/**
 * Linear Armory → pattern scale.
 * pistol stock 55 → 1.0; recoil 100 → ~1.82; recoil 0 → 0.25 (floor).
 */
export function recoilPatternScale(
  weaponId: string,
  stats: WeaponEffectiveStats,
): number {
  const base = catalogBaseRecoil(weaponId, stats);
  if (base <= 0) return 1;
  return Math.max(MIN_RECOIL_SCALE, Math.min(MAX_RECOIL_SCALE, stats.recoil / base));
}

function scaleRecoilConfig(recoil: RecoilConfig, scale: number): RecoilConfig {
  // Amplitude only — recovery timing stays on the catalog feel.
  return {
    ...recoil,
    pattern: recoil.pattern.map((kick) => ({
      pitch: kick.pitch * scale,
      yaw: kick.yaw * scale,
    })),
    visualKick: recoil.visualKick * scale,
  };
}

/**
 * Overlay Armory effective stats onto a base weapon config for match play.
 * Always pass the unmodified catalog config — do not chain on an already-scaled config.
 */
export function withEffectiveWeaponStats(
  config: WeaponConfig,
  stats: WeaponEffectiveStats,
): WeaponConfig {
  const recoilScale = recoilPatternScale(config.id, stats);

  return {
    ...config,
    damage: stats.damage,
    clipSize: Math.max(1, Math.round(stats.magazineSize)),
    reloadSec: Math.max(0, stats.reloadTime),
    adsTime: Math.max(0.05, stats.adsTime),
    maxHitDistance: Math.max(0, stats.range),
    meleeRange:
      config.fireMode === 'melee' ? Math.max(0, stats.range) : config.meleeRange,
    recoil: scaleRecoilConfig(config.recoil, recoilScale),
  };
}
