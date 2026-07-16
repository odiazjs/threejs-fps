import { getFiringRangePickupY } from '../../shared/level/firingRangePickups';
import { getClientMapDef } from '../../shared/level/maps';

/** Visual placement height for world pickups (crate tops on Firing Range, terrain elsewhere). */
export function resolvePickupSurfaceY(x: number, z: number): number {
  const map = getClientMapDef();
  if (map.id === 'firing_range') {
    const crateY = getFiringRangePickupY(x, z);
    if (crateY !== undefined) return crateY;
  }
  return map.sampleGroundHeight(x, z);
}

/**
 * Prefer an authored / server feet Y (platforms, player drops), but never place
 * below the local surface sample (crate tops, terrain).
 */
export function resolvePickupPlacementY(x: number, z: number, storedY?: number): number {
  const surfaceY = resolvePickupSurfaceY(x, z);
  if (typeof storedY === 'number' && Number.isFinite(storedY)) {
    return Math.max(storedY, surfaceY);
  }
  return surfaceY;
}
