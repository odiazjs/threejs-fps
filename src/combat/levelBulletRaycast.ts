import { raycastLevel, type RaycastHit } from '../../shared/level/collision';
import { getClientGameplayColliders, getClientMapDef } from '../../shared/level/maps';
import { getLevelMeshBvhCollision } from '../player/levelMovement';

/** Bullet raycast — mesh BVH on Chrono-Bowl when ready, otherwise AABB fallback. */
export function raycastLevelBullets(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
  minDistance = 0,
): RaycastHit | null {
  const meshCollision = getLevelMeshBvhCollision();
  if (meshCollision?.isReady) {
    return meshCollision.raycast(ox, oy, oz, dx, dy, dz, maxDistance, minDistance);
  }

  const map = getClientMapDef();
  return raycastLevel(
    ox,
    oy,
    oz,
    dx,
    dy,
    dz,
    maxDistance,
    minDistance,
    map,
    getClientGameplayColliders(map),
  );
}
