export type WeaponId = 'plasma_rifle' | 'pistol';

export const LOADOUT_SIZE = 2;

/** Fixed loadout slot order (slot 0 = key 1, slot 1 = key 2). */
export const LOADOUT_WEAPON_IDS = ['pistol', 'plasma_rifle'] as const satisfies readonly WeaponId[];

export function isWeaponId(value: string): value is WeaponId {
  return value === 'plasma_rifle' || value === 'pistol';
}

export function loadoutSlotFromKey(code: string): number | null {
  if (code === 'Digit1') return 0;
  if (code === 'Digit2') return 1;
  return null;
}
