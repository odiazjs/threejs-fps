import type { WeaponBaseStats } from '../../../../shared/content/weaponUpgrades.js';
import { SHIPPED_WEAPON_BASE_STATS } from '../../../../shared/content/weaponUpgrades.js';

/**
 * Canonical catalog rows for the current shipped weapons.
 * Migration seeds these; upsertCurrentWeaponCatalog syncs them on demand.
 */
export const CURRENT_WEAPON_CATALOG = [
  {
    id: 'pistol',
    displayName: 'Pistol',
    kind: 'gun' as const,
    loadoutEligible: true,
    enabled: true,
    sortOrder: 10,
    baseStats: SHIPPED_WEAPON_BASE_STATS.pistol,
  },
  {
    id: 'plasma_rifle',
    displayName: 'Plasma Rifle',
    kind: 'gun' as const,
    loadoutEligible: true,
    enabled: true,
    sortOrder: 20,
    baseStats: SHIPPED_WEAPON_BASE_STATS.plasma_rifle,
  },
  {
    id: 'root_bio_carbine',
    displayName: 'Root Bio Carbine',
    kind: 'gun' as const,
    loadoutEligible: true,
    enabled: true,
    sortOrder: 25,
    baseStats: SHIPPED_WEAPON_BASE_STATS.root_bio_carbine,
  },
  {
    id: 'bio_liquid_rifle',
    displayName: 'Bio-Liquid Rifle',
    kind: 'gun' as const,
    loadoutEligible: true,
    enabled: true,
    sortOrder: 26,
    baseStats: SHIPPED_WEAPON_BASE_STATS.bio_liquid_rifle,
  },
  {
    id: 'plasma_shotgun',
    displayName: 'Plasma Shotgun',
    kind: 'gun' as const,
    loadoutEligible: true,
    enabled: true,
    sortOrder: 27,
    baseStats: SHIPPED_WEAPON_BASE_STATS.plasma_shotgun,
  },
  {
    id: 'sniper_rifle',
    displayName: 'Sniper Rifle',
    kind: 'gun' as const,
    loadoutEligible: true,
    enabled: true,
    sortOrder: 30,
    baseStats: SHIPPED_WEAPON_BASE_STATS.sniper_rifle,
  },
  {
    id: 'katana',
    displayName: 'Katana',
    kind: 'melee' as const,
    loadoutEligible: false,
    enabled: true,
    sortOrder: 100,
    baseStats: SHIPPED_WEAPON_BASE_STATS.katana,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  displayName: string;
  kind: 'gun' | 'melee';
  loadoutEligible: boolean;
  enabled: boolean;
  sortOrder: number;
  baseStats: WeaponBaseStats;
}>;
