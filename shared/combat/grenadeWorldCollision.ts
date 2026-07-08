import { getMapPhysics } from '../level/mapMeshMovement.js';
import { GRENADE_COLLISION_RADIUS } from '../throwables/grenadeConfig.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

export interface GrenadeWorldRaycastHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

export interface GrenadeWorldRaycast {
  raycastSegment(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
  ): GrenadeWorldRaycastHit | null;
}

export function createGrenadeWorldRaycast(
  physics: LevelPhysicsWorld | null = getMapPhysics(),
): GrenadeWorldRaycast | null {
  if (!physics?.isReady) return null;
  const radius = GRENADE_COLLISION_RADIUS;

  return {
    raycastSegment(ox, oy, oz, dx, dy, dz, maxDistance) {
      const len = Math.hypot(dx, dy, dz);
      if (len <= 1e-8 || maxDistance <= 1e-8) return null;

      const inv = 1 / len;
      const dirX = dx * inv;
      const dirY = dy * inv;
      const dirZ = dz * inv;
      const skin = radius * 0.85;

      const hit = physics.raycastWithNormal(
        ox + dirX * skin,
        oy + dirY * skin,
        oz + dirZ * skin,
        dx,
        dy,
        dz,
        maxDistance + skin,
        0,
        false,
      );
      if (!hit) return null;

      const contactDistance = hit.distance - skin;
      if (contactDistance > maxDistance + 1e-4) return null;

      return {
        ...hit,
        distance: Math.max(0, contactDistance),
      };
    },
  };
}
