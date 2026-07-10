import { WEAPON_RELOAD_SEC } from '../content/weaponStats.js';
import type { WeaponId } from '../content/weaponIds.js';

export interface ReloadState {
  readonly reloading: boolean;
  readonly progress: number;
}

/**
 * @param reloadSecOverride — Armory-upgraded reload duration when known.
 *   Falls back to catalog `WEAPON_RELOAD_SEC` for remotes without that data.
 */
export function getReloadState(
  reloadEndAt: number,
  worldTime: number,
  weaponId: WeaponId = 'plasma_rifle',
  reloadSecOverride?: number,
): ReloadState {
  if (reloadEndAt <= 0) {
    return { reloading: false, progress: 0 };
  }

  const catalog = WEAPON_RELOAD_SEC[weaponId] ?? 1;
  const reloadSec =
    reloadSecOverride !== undefined && Number.isFinite(reloadSecOverride) && reloadSecOverride > 0
      ? reloadSecOverride
      : catalog;
  const remaining = reloadEndAt - worldTime;
  if (remaining <= 0) {
    return { reloading: false, progress: 0 };
  }

  return {
    reloading: true,
    progress: 1 - remaining / reloadSec,
  };
}
