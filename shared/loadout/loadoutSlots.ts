import { LOADOUT_SIZE, LOADOUT_WEAPON_IDS, isPickableWeaponId, isWeaponId, MELEE_WEAPON_ID } from '../content/weaponIds.js';

export const EMPTY_WEAPON_SLOT = '';

export interface LoadoutSlotSnapshot {
  readonly weaponSlot0: string;
  readonly weaponSlot1: string;
  readonly weaponSlot2: string;
}

export function getLoadoutSlotWeapon(
  slots: LoadoutSlotSnapshot,
  index: number,
): string {
  switch (index) {
    case 0:
      return slots.weaponSlot0;
    case 1:
      return slots.weaponSlot1;
    case 2:
      return slots.weaponSlot2;
    default:
      return EMPTY_WEAPON_SLOT;
  }
}

export function setLoadoutSlotWeapon(
  slots: { weaponSlot0: string; weaponSlot1: string; weaponSlot2: string },
  index: number,
  weaponId: string,
): void {
  switch (index) {
    case 0:
      slots.weaponSlot0 = weaponId;
      break;
    case 1:
      slots.weaponSlot1 = weaponId;
      break;
    case 2:
      slots.weaponSlot2 = weaponId;
      break;
  }
}

export function initDefaultLoadoutSlots(
  slots: { weaponSlot0: string; weaponSlot1: string; weaponSlot2: string },
): void {
  slots.weaponSlot0 = LOADOUT_WEAPON_IDS[0]!;
  slots.weaponSlot1 = LOADOUT_WEAPON_IDS[1]!;
  slots.weaponSlot2 = LOADOUT_WEAPON_IDS[2]!;
}

export function clearLoadoutSlots(
  slots: { weaponSlot0: string; weaponSlot1: string; weaponSlot2: string },
): void {
  slots.weaponSlot0 = EMPTY_WEAPON_SLOT;
  slots.weaponSlot1 = EMPTY_WEAPON_SLOT;
  slots.weaponSlot2 = EMPTY_WEAPON_SLOT;
}

/** Melee is equipped via X only — never stored in numbered slots. */
export function sanitizeLoadoutSlots(
  slots: { weaponSlot0: string; weaponSlot1: string; weaponSlot2: string },
): void {
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    if (getLoadoutSlotWeapon(slots, i) === MELEE_WEAPON_ID) {
      setLoadoutSlotWeapon(slots, i, EMPTY_WEAPON_SLOT);
    }
  }
}

export function isLoadoutSlotOccupied(
  slots: LoadoutSlotSnapshot,
  index: number,
): boolean {
  const weaponId = getLoadoutSlotWeapon(slots, index);
  return isPickableWeaponId(weaponId);
}

export function countOccupiedLoadoutSlots(slots: LoadoutSlotSnapshot): number {
  let count = 0;
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    if (isLoadoutSlotOccupied(slots, i)) count += 1;
  }
  return count;
}

export function findLowestOccupiedLoadoutSlot(slots: LoadoutSlotSnapshot): number {
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    if (isLoadoutSlotOccupied(slots, i)) return i;
  }
  return -1;
}

export function isValidDropSlot(
  slots: LoadoutSlotSnapshot,
  slotIndex: number,
): boolean {
  if (slotIndex < 0 || slotIndex >= LOADOUT_SIZE) return false;
  const weaponId = getLoadoutSlotWeapon(slots, slotIndex);
  if (!isPickableWeaponId(weaponId)) return false;
  return countOccupiedLoadoutSlots(slots) > 1;
}

export function findLoadoutSlotForWeaponId(
  slots: LoadoutSlotSnapshot,
  weaponId: string,
): number {
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    if (getLoadoutSlotWeapon(slots, i) === weaponId) return i;
  }
  return -1;
}

export function findLowestEmptyLoadoutSlot(slots: LoadoutSlotSnapshot): number {
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    if (!isLoadoutSlotOccupied(slots, i)) return i;
  }
  return -1;
}

export function findActiveWeaponSlot(
  slots: LoadoutSlotSnapshot,
  activeWeaponId: string,
): number {
  return findLoadoutSlotForWeaponId(slots, activeWeaponId);
}

export interface WeaponPickupResolution {
  targetSlot: number;
  replacedWeaponId: string | null;
}

/**
 * Loadout slot for the gun the player is currently holding.
 * When melee is toggled on, uses the holstered gun's slot.
 */
export function resolveEquippedLoadoutSlot(
  slots: LoadoutSlotSnapshot,
  activeWeaponId: string,
  holsteredWeaponId?: string | null,
): number {
  const activeSlot = findActiveWeaponSlot(slots, activeWeaponId);
  if (activeSlot >= 0) return activeSlot;

  if (activeWeaponId === MELEE_WEAPON_ID) {
    if (holsteredWeaponId) {
      const holsteredSlot = findActiveWeaponSlot(slots, holsteredWeaponId);
      if (holsteredSlot >= 0) return holsteredSlot;
    }
  }

  return findLowestOccupiedLoadoutSlot(slots);
}

/** Decide which loadout slot receives a picked-up gun. */
export function resolveWeaponPickup(
  slots: LoadoutSlotSnapshot,
  activeWeaponId: string,
  weaponId: string,
  holsteredWeaponId?: string | null,
): WeaponPickupResolution | null {
  if (!isPickableWeaponId(weaponId)) return null;

  const emptySlot = findLowestEmptyLoadoutSlot(slots);
  if (emptySlot >= 0) {
    return { targetSlot: emptySlot, replacedWeaponId: null };
  }

  // Loadout full — drop the equipped weapon from its slot, then take the pickup.
  const targetSlot = resolveEquippedLoadoutSlot(
    slots,
    activeWeaponId,
    holsteredWeaponId,
  );
  if (targetSlot < 0) return null;

  const replacedWeaponId = getLoadoutSlotWeapon(slots, targetSlot);
  if (!isPickableWeaponId(replacedWeaponId)) return null;

  return { targetSlot, replacedWeaponId };
}

export function canPickupWeaponDrop(
  slots: LoadoutSlotSnapshot,
  activeWeaponId: string,
  weaponId: string,
  holsteredWeaponId?: string | null,
): boolean {
  return resolveWeaponPickup(slots, activeWeaponId, weaponId, holsteredWeaponId) !== null;
}
