import type { WeaponBaseStats, WeaponEffectiveStats, WeaponUpgradeLevels, WeaponUpgradeStatId } from '../content/weaponUpgrades.js';

export type { WeaponBaseStats, WeaponEffectiveStats, WeaponUpgradeLevels, WeaponUpgradeStatId };

export type WeaponKind = 'gun' | 'melee';

export interface WeaponCatalogEntry {
  id: string;
  displayName: string;
  kind: WeaponKind;
  loadoutEligible: boolean;
  enabled: boolean;
  sortOrder: number;
  baseStats: WeaponBaseStats;
}

export interface WeaponsListResponse {
  weapons: WeaponCatalogEntry[];
}

export interface PlayerWeaponEntry extends WeaponCatalogEntry {
  levels: WeaponUpgradeLevels;
  effectiveStats: WeaponEffectiveStats;
  /** Plasma mineral cost to buy the next level of each stat (0 if maxed). */
  nextUpgradeCost: Record<WeaponUpgradeStatId, number>;
}

export interface PlayerWeaponsListResponse {
  plasmaMinerals: number;
  weapons: PlayerWeaponEntry[];
}

export interface UpgradeWeaponStatRequest {
  stat: WeaponUpgradeStatId;
  /** +1 upgrade (default) or −1 downgrade/refund. */
  delta?: 1 | -1;
}

export interface UpgradeWeaponStatResponse {
  plasmaMinerals: number;
  /** Positive when spent, negative when refunded. */
  costSpent: number;
  weapon: PlayerWeaponEntry;
}

/** Per-stat level deltas relative to the player's current saved levels. */
export type WeaponUpgradeLevelDeltas = Partial<Record<WeaponUpgradeStatId, number>>;

export interface BatchUpgradeWeaponRequest {
  /** Level change per stat (e.g. damage: +3, recoil: -1). Omitted/0 stats are ignored. */
  deltas: WeaponUpgradeLevelDeltas;
}

export interface BatchUpgradeWeaponResponse {
  plasmaMinerals: number;
  /** Net plasma change: positive spent, negative refunded. */
  costSpent: number;
  weapon: PlayerWeaponEntry;
}
