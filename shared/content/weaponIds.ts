export type WeaponId =
  | 'plasma_rifle'
  | 'pistol'
  | 'sniper_rifle'
  | 'root_bio_carbine'
  | 'bio_liquid_rifle'
  | 'bio_machine_gun'
  | 'bio_smg_1'
  | 'plasma_shotgun'
  | 'katana';

export const MELEE_WEAPON_ID = 'katana' as const satisfies WeaponId;

export const LOADOUT_SIZE = 3;

/** Fixed loadout slot order (slot 0 = key 1, slot 1 = key 2, slot 2 = key 3). */
export const LOADOUT_WEAPON_IDS = [
  'pistol',
  'plasma_rifle',
  'sniper_rifle',
  'katana',
] as const satisfies readonly WeaponId[];

export function isWeaponId(value: string): value is WeaponId {
  return (
    value === 'plasma_rifle' ||
    value === 'pistol' ||
    value === 'sniper_rifle' ||
    value === 'root_bio_carbine' ||
    value === 'bio_liquid_rifle' ||
    value === 'bio_machine_gun' ||
    value === 'bio_smg_1' ||
    value === 'plasma_shotgun' ||
    value === 'katana'
  );
}

/** Guns that can occupy numbered loadout slots or be picked up / dropped. */
export function isPickableWeaponId(value: string): value is WeaponId {
  return isWeaponId(value) && value !== MELEE_WEAPON_ID;
}

export function loadoutSlotFromKey(code: string): number | null {
  if (code === 'Digit1') return 0;
  if (code === 'Digit2') return 1;
  if (code === 'Digit3') return 2;
  return null;
}
