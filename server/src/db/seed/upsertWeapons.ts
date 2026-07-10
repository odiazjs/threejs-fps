import { getDb } from '../index.js';
import { weapons } from '../schema/weapons.js';
import { CURRENT_WEAPON_CATALOG } from './weaponCatalog.js';

/** Upsert the shipped catalog. Does not delete extra rows added later via DB. */
export async function upsertCurrentWeaponCatalog(): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const weapon of CURRENT_WEAPON_CATALOG) {
    const { baseStats } = weapon;
    await db
      .insert(weapons)
      .values({
        id: weapon.id,
        displayName: weapon.displayName,
        kind: weapon.kind,
        loadoutEligible: weapon.loadoutEligible,
        enabled: weapon.enabled,
        sortOrder: weapon.sortOrder,
        baseDamage: baseStats.damage,
        baseRecoil: baseStats.recoil,
        baseRange: baseStats.range,
        baseMagazineSize: baseStats.magazineSize,
        baseReloadSec: baseStats.reloadTime,
        baseAdsSec: baseStats.adsTime,
        baseFireRate: baseStats.fireRate,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: weapons.id,
        set: {
          displayName: weapon.displayName,
          kind: weapon.kind,
          loadoutEligible: weapon.loadoutEligible,
          enabled: weapon.enabled,
          sortOrder: weapon.sortOrder,
          baseDamage: baseStats.damage,
          baseRecoil: baseStats.recoil,
          baseRange: baseStats.range,
          baseMagazineSize: baseStats.magazineSize,
          baseReloadSec: baseStats.reloadTime,
          baseAdsSec: baseStats.adsTime,
          baseFireRate: baseStats.fireRate,
          updatedAt: now,
        },
      });
  }
}
