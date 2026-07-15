import { raycastLevel, type RaycastHit } from '../../shared/level/collision';
import { getClientGameplayColliders, getClientMapDef } from '../../shared/level/maps';
import { getClientPhysicsWorld } from '../physics/buildMapPhysics';

/** Bullet hit — surface normal present when the Rapier world resolved the ray. */
export interface BulletRaycastHit extends RaycastHit {
  nx?: number;
  ny?: number;
  nz?: number;
}

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
): BulletRaycastHit | null {
  const physics = getClientPhysicsWorld();
  if (physics?.isReady) {
    // Normal feeds bullet-hole decal orientation on impact.
    return physics.raycastWithNormal(ox, oy, oz, dx, dy, dz, maxDistance, minDistance);
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
