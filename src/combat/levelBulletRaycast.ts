import { raycastLevel, type RaycastHit } from '../../shared/level/collision';
import { getClientGameplayColliders, getClientMapDef } from '../../shared/level/maps';
import { getClientPhysicsWorld } from '../physics/buildMapPhysics';

/** Bullet raycast — Rapier when physics world is ready, otherwise AABB fallback. */
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
  const physics = getClientPhysicsWorld();
  if (physics?.isReady) {
    return physics.raycast(ox, oy, oz, dx, dy, dz, maxDistance, minDistance);
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
