import type { EquippedWeaponSightsMap } from '../../shared/api/weaponUnlockables';
import { getDigitalSightCatalogEntry } from './digitalWeaponSights';

/** Per-weapon equipped sight unlockable ids for the local player. */
const equippedSightByWeaponId = new Map<string, string | null>();

export function setEquippedSightForWeapon(
  weaponId: string,
  sightId: string | null | undefined,
): void {
  if (!weaponId) return;
  if (sightId) equippedSightByWeaponId.set(weaponId, sightId);
  else equippedSightByWeaponId.set(weaponId, null);
}

export function getEquippedSightForWeapon(weaponId: string): string | null {
  return equippedSightByWeaponId.get(weaponId) ?? null;
}

/** Replace local cache from the persisted DB map (after reload / equip). */
export function hydrateEquippedWeaponSights(equippedSights: EquippedWeaponSightsMap): void {
  equippedSightByWeaponId.clear();
  for (const [weaponId, sightId] of Object.entries(equippedSights)) {
    if (weaponId && sightId) {
      equippedSightByWeaponId.set(weaponId, sightId);
    }
  }
}

/**
 * Merge loadout slot sights into the local map.
 * Null/omitted ids do not clear hydrated equips (full map comes from the API).
 */
export function applyLoadoutSightAssignments(input: {
  primaryWeaponId: string;
  secondaryWeaponId: string;
  primarySightId?: string | null;
  secondarySightId?: string | null;
}): void {
  if (input.primarySightId) {
    setEquippedSightForWeapon(input.primaryWeaponId, input.primarySightId);
  }
  if (input.secondarySightId) {
    setEquippedSightForWeapon(input.secondaryWeaponId, input.secondarySightId);
  }
}

/** Whether this weapon has any known digital optic equipped. */
export function weaponHasDigitalSight(weaponId: string): boolean {
  return getDigitalSightCatalogEntry(getEquippedSightForWeapon(weaponId)) != null;
}

/** @deprecated Use weaponHasDigitalSight — kept for older call sites. */
export function weaponHasRetherPulseSight(weaponId: string): boolean {
  return weaponHasDigitalSight(weaponId);
}
