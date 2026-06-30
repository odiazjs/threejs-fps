import { LOADOUT_SIZE, LOADOUT_WEAPON_IDS, isWeaponId } from '../content/weaponIds.js';

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

export function isLoadoutSlotOccupied(
  slots: LoadoutSlotSnapshot,
  index: number,
): boolean {
  const weaponId = getLoadoutSlotWeapon(slots, index);
  return isWeaponId(weaponId);
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
  if (!isLoadoutSlotOccupied(slots, slotIndex)) return false;
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

/** Decide which loadout slot receives a picked-up weapon. */
export function resolveWeaponPickup(
  slots: LoadoutSlotSnapshot,
  activeWeaponId: string,
  weaponId: string,
): WeaponPickupResolution | null {
  if (!isWeaponId(weaponId)) return null;

  const existingSlot = findLoadoutSlotForWeaponId(slots, weaponId);
  if (existingSlot >= 0) {
    return { targetSlot: existingSlot, replacedWeaponId: null };
  }

  const emptySlot = findLowestEmptyLoadoutSlot(slots);
  if (emptySlot >= 0) {
    return { targetSlot: emptySlot, replacedWeaponId: null };
  }

  const activeSlot = findActiveWeaponSlot(slots, activeWeaponId);
  const targetSlot = activeSlot >= 0 ? activeSlot : 0;
  const replacedWeaponId = getLoadoutSlotWeapon(slots, targetSlot);
  if (!replacedWeaponId) return null;

  return { targetSlot, replacedWeaponId };
}
