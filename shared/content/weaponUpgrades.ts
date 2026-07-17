import type { WeaponId } from '../content/weaponIds.js';

/** Upgradeable combat stats exposed by the weapons API. */
export const WEAPON_UPGRADE_STAT_IDS = [
  'fireRate',
  'damage',
  'recoil',
  'range',
  'magazineSize',
  'reloadTime',
  'adsTime',
] as const;

export type WeaponUpgradeStatId = (typeof WEAPON_UPGRADE_STAT_IDS)[number];

/**
 * Soft UI hint only — upgrades are not hard-capped at this level.
 * Effective values are limited by Armory track ceilings / affordability.
 */
export const WEAPON_UPGRADE_MAX_LEVEL = 10;

/** Starting plasma minerals granted to new accounts. */
export const PLASMA_MINERALS_STARTING_BALANCE = 200;

/** Fixed plasma mineral cost for each upgrade level (does not escalate). */
export const PLASMA_MINERAL_UPGRADE_COST = 25;

/** Stats that improve by +step per upgrade level. */
export const WEAPON_UPGRADE_PLUS_STATS = [
  'damage',
  'range',
  'magazineSize',
  'fireRate',
] as const satisfies readonly WeaponUpgradeStatId[];

/** Stats that improve by −step per upgrade level (lower is better). */
export const WEAPON_UPGRADE_MINUS_STATS = [
  'recoil',
  'reloadTime',
  'adsTime',
] as const satisfies readonly WeaponUpgradeStatId[];

/**
 * How much each upgrade level changes the effective stat value.
 * Plus stats add this; minus stats subtract this (floored at 0).
 */
export const WEAPON_UPGRADE_STEP_BY_STAT: Record<WeaponUpgradeStatId, number> = {
  damage: 1,
  recoil: 1,
  range: 1,
  magazineSize: 1,
  reloadTime: 0.1,
  adsTime: 0.05,
  /** Shots (or melee swings) per second. */
  fireRate: 0.5,
};

/** Base catalog values (level 0) for a weapon. */
export interface WeaponBaseStats {
  damage: number;
  /** Recoil intensity 0–100 (higher = more kick). Upgrades reduce this. */
  recoil: number;
  /** Max effective hit distance in world units. */
  range: number;
  magazineSize: number;
  /** Reload duration in seconds. Upgrades reduce this. */
  reloadTime: number;
  /** Seconds to reach full ADS. Upgrades reduce this. */
  adsTime: number;
  /** Shots (or melee swings) per second. */
  fireRate: number;
}

export type WeaponUpgradeLevels = Record<WeaponUpgradeStatId, number>;

export interface WeaponEffectiveStats extends WeaponBaseStats {
  levels: WeaponUpgradeLevels;
}

export function isWeaponUpgradeStatId(value: string): value is WeaponUpgradeStatId {
  return (WEAPON_UPGRADE_STAT_IDS as readonly string[]).includes(value);
}

export function zeroUpgradeLevels(): WeaponUpgradeLevels {
  return {
    damage: 0,
    recoil: 0,
    range: 0,
    magazineSize: 0,
    reloadTime: 0,
    adsTime: 0,
    fireRate: 0,
  };
}

/** Integer level (may be negative — worse than catalog base for testing / free Armory edits). */
export function clampUpgradeLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.floor(level);
}

export function normalizeUpgradeLevels(
  partial?: Partial<WeaponUpgradeLevels> | null,
): WeaponUpgradeLevels {
  const zero = zeroUpgradeLevels();
  if (!partial) return zero;
  return {
    damage: clampUpgradeLevel(partial.damage ?? 0),
    recoil: clampUpgradeLevel(partial.recoil ?? 0),
    range: clampUpgradeLevel(partial.range ?? 0),
    magazineSize: clampUpgradeLevel(partial.magazineSize ?? 0),
    reloadTime: clampUpgradeLevel(partial.reloadTime ?? 0),
    adsTime: clampUpgradeLevel(partial.adsTime ?? 0),
    fireRate: clampUpgradeLevel(partial.fireRate ?? 0),
  };
}

/** Cost in plasma minerals to raise `currentLevel` → `currentLevel + 1` (fixed). */
export function plasmaMineralCostForNextLevel(currentLevel: number): number {
  if (!Number.isFinite(currentLevel)) return 0;
  return PLASMA_MINERAL_UPGRADE_COST;
}

/**
 * Total plasma cost to change a stat from `fromLevel` to `toLevel`.
 * Positive when upgrading, negative when downgrading (refund).
 */
export function plasmaMineralCostForLevelRange(fromLevel: number, toLevel: number): number {
  const from = clampUpgradeLevel(fromLevel);
  const to = clampUpgradeLevel(toLevel);
  return PLASMA_MINERAL_UPGRADE_COST * (to - from);
}

export function isPlusUpgradeStat(stat: WeaponUpgradeStatId): boolean {
  return (WEAPON_UPGRADE_PLUS_STATS as readonly WeaponUpgradeStatId[]).includes(stat);
}

export function weaponUpgradeStep(stat: WeaponUpgradeStatId): number {
  return WEAPON_UPGRADE_STEP_BY_STAT[stat];
}

function roundStat(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Apply per-stat upgrade levels to catalog base stats.
 * Each level shifts the value by `WEAPON_UPGRADE_STEP_BY_STAT` (+ or − by type).
 */
export function resolveEffectiveWeaponStats(
  base: WeaponBaseStats,
  levelsInput?: Partial<WeaponUpgradeLevels> | null,
): WeaponEffectiveStats {
  const levels = normalizeUpgradeLevels(levelsInput);
  const step = WEAPON_UPGRADE_STEP_BY_STAT;

  return {
    damage: roundStat(base.damage + levels.damage * step.damage),
    recoil: roundStat(Math.max(0, base.recoil - levels.recoil * step.recoil)),
    range: roundStat(base.range + levels.range * step.range),
    magazineSize: Math.max(1, Math.round(base.magazineSize + levels.magazineSize * step.magazineSize)),
    reloadTime: roundStat(Math.max(0, base.reloadTime - levels.reloadTime * step.reloadTime)),
    adsTime: roundStat(Math.max(0, base.adsTime - levels.adsTime * step.adsTime), 3),
    fireRate: roundStat(Math.max(0, base.fireRate + levels.fireRate * step.fireRate), 2),
    levels,
  };
}

/** Shipped base stats — kept in sync with client weapon configs / shared weaponStats. */
export const SHIPPED_WEAPON_BASE_STATS: Record<WeaponId, WeaponBaseStats> = {
  pistol: {
    damage: 11,
    recoil: 55,
    range: 75,
    magazineSize: 12,
    reloadTime: 1.5,
    adsTime: 0.18,
    fireRate: 5,
  },
  plasma_rifle: {
    damage: 7,
    recoil: 35,
    range: 75,
    magazineSize: 30,
    reloadTime: 2.0,
    adsTime: 0.2,
    fireRate: 12,
  },
  root_bio_carbine: {
    damage: 8,
    recoil: 38,
    range: 80,
    magazineSize: 30,
    reloadTime: 1.9,
    adsTime: 0.19,
    fireRate: 14,
  },
  bio_liquid_rifle: {
    damage: 16,
    recoil: 80,
    range: 70,
    magazineSize: 18,
    reloadTime: 1.9,
    adsTime: 0.22,
    fireRate: 7,
  },
  bio_machine_gun: {
    damage: 11,
    recoil: 30,
    range: 72,
    magazineSize: 80,
    reloadTime: 3.6,
    adsTime: 0.34,
    fireRate: 19,
  },
  plasma_shotgun: {
    damage: 10,
    recoil: 88,
    range: 38,
    magazineSize: 6,
    reloadTime: 3.5,
    adsTime: 0.28,
    fireRate: 2.6,
  },
  sniper_rifle: {
    damage: 90,
    recoil: 85,
    range: 220,
    magazineSize: 1,
    reloadTime: 2.75,
    adsTime: 0.35,
    fireRate: 1.1,
  },
  katana: {
    damage: 44,
    recoil: 0,
    range: 2.8,
    magazineSize: 1,
    reloadTime: 0,
    adsTime: 0,
    fireRate: 2,
  },
};
