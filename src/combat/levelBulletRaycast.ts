import { raycastLevel, type RaycastHit } from '../../shared/level/collision';
import type { LevelMeshBvhBulletRaycast } from '../world/LevelMeshBvhBulletRaycast';

let meshBulletRaycast: LevelMeshBvhBulletRaycast | null = null;

export function setLevelMeshBvhBulletRaycast(provider: LevelMeshBvhBulletRaycast | null): void {
  meshBulletRaycast = provider;
}

/** Bullet raycast — mesh BVH on Chrono-Bowl when ready, otherwise voxel AABB fallback. */
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
  if (meshBulletRaycast?.isReady) {
    return meshBulletRaycast.raycast(ox, oy, oz, dx, dy, dz, maxDistance, minDistance);
  }

  return raycastLevel(ox, oy, oz, dx, dy, dz, maxDistance, minDistance);
}
