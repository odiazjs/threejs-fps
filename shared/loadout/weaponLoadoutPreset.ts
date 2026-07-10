import type { WeaponId } from '../content/weaponIds.js';
import { EMPTY_WEAPON_SLOT, clearLoadoutSlots, setLoadoutSlotWeapon } from './loadoutSlots.js';

export const WEAPON_LOADOUT_NAME_MAX_LENGTH = 24;
export const WEAPON_LOADOUT_MAX_PER_USER = 8;

/** Primary / secondary slot IDs as stored on a loadout (DB-backed catalog). */
export interface WeaponLoadoutPresetWeapons {
  readonly primaryWeaponId: string;
  readonly secondaryWeaponId: string;
}

export function normalizeWeaponLoadoutName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function validateWeaponLoadoutName(raw: string): string {
  const name = normalizeWeaponLoadoutName(raw);
  if (!name) {
    throw new Error('Loadout name is required');
  }
  if (name.length > WEAPON_LOADOUT_NAME_MAX_LENGTH) {
    throw new Error(`Loadout name must be ${WEAPON_LOADOUT_NAME_MAX_LENGTH} characters or fewer`);
  }
  return name;
}

/** Structural pair checks only — catalog eligibility is validated against the DB. */
export function assertDistinctLoadoutWeapons(
  primaryWeaponId: string,
  secondaryWeaponId: string,
): WeaponLoadoutPresetWeapons {
  const primary = primaryWeaponId.trim();
  const secondary = secondaryWeaponId.trim();
  if (!primary) {
    throw new Error('Primary weapon is required');
  }
  if (!secondary) {
    throw new Error('Secondary weapon is required');
  }
  if (primary === secondary) {
    throw new Error('Primary and secondary must be different weapons');
  }
  return { primaryWeaponId: primary, secondaryWeaponId: secondary };
}

/**
 * Apply a saved primary/secondary preset into live match slots.
 * Slot 0 = primary (key 1), slot 1 = secondary (key 2), slot 2 stays empty.
 * Melee remains available via the dedicated melee key, not a numbered slot.
 */
export function applyWeaponLoadoutPreset(
  slots: { weaponSlot0: string; weaponSlot1: string; weaponSlot2: string },
  preset: WeaponLoadoutPresetWeapons,
): string {
  clearLoadoutSlots(slots);
  setLoadoutSlotWeapon(slots, 0, preset.primaryWeaponId);
  setLoadoutSlotWeapon(slots, 1, preset.secondaryWeaponId);
  setLoadoutSlotWeapon(slots, 2, EMPTY_WEAPON_SLOT);
  return preset.primaryWeaponId;
}

/** Narrow helper when a caller already knows both IDs are shipped WeaponIds. */
export function asWeaponId(weaponId: string): WeaponId {
  return weaponId as WeaponId;
}
