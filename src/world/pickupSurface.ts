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
