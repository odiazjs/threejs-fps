import type { WeaponId } from '../../shared/content/weaponIds';
import { isPickableWeaponId } from '../../shared/content/weaponIds';
import { apiListLoadouts } from '../auth/loadoutsApi';

const FALLBACK_LOBBY_WEAPON: WeaponId = 'plasma_rifle';

/** Primary gun from the player's default loadout, or rifle fallback. */
export async function fetchDefaultPrimaryWeaponId(): Promise<WeaponId> {
  try {
    const { loadouts } = await apiListLoadouts();
    const preferred = loadouts.find((entry) => entry.isDefault) ?? loadouts[0];
    const primary = preferred?.primaryWeaponId?.trim() ?? '';
    if (isPickableWeaponId(primary)) {
      return primary;
    }
  } catch (error) {
    console.warn('[lobby] could not load default loadout for avatar', error);
  }
  return FALLBACK_LOBBY_WEAPON;
}
