import { WEAPON_RELOAD_SEC } from '../content/weaponStats.js';
import type { WeaponId } from '../content/weaponIds.js';

export interface ReloadState {
  readonly reloading: boolean;
  readonly progress: number;
}

export function getReloadState(
  reloadEndAt: number,
  worldTime: number,
  weaponId: WeaponId = 'plasma_rifle',
): ReloadState {
  if (reloadEndAt <= 0) {
    return { reloading: false, progress: 0 };
  }

  const reloadSec = WEAPON_RELOAD_SEC[weaponId];
  const remaining = reloadEndAt - worldTime;
  if (remaining <= 0) {
    return { reloading: false, progress: 0 };
  }

  return {
    reloading: true,
    progress: 1 - remaining / reloadSec,
  };
}
