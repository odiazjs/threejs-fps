import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../level/levelData.js';

/** Extra tolerance for laggy remote positions and fast projectiles. */
export const PLAYER_HITBOX_PADDING = 0.25;

export interface PlayerHitTarget {
  feetX: number;
  feetY: number;
  feetZ: number;
}

function playerAabb(feetX: number, feetY: number, feetZ: number) {
  const pad = PLAYER_HITBOX_PADDING;
  return {
    minX: feetX - PLAYER_HALF_WIDTH - pad,
    maxX: feetX + PLAYER_HALF_WIDTH + pad,
    minY: feetY - pad,
    maxY: feetY + PLAYER_HEIGHT + pad,
    minZ: feetZ - PLAYER_HALF_WIDTH - pad,
    maxZ: feetZ + PLAYER_HALF_WIDTH + pad,
  };
}

/** Ray segment vs player body AABB (used for projectile hit tests). */
export function rayHitsPlayer(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  distance: number,
  target: PlayerHitTarget,
): boolean {
  const box = playerAabb(target.feetX, target.feetY, target.feetZ);
  const invX = dirX !== 0 ? 1 / dirX : Number.POSITIVE_INFINITY;
  const invY = dirY !== 0 ? 1 / dirY : Number.POSITIVE_INFINITY;
  const invZ = dirZ !== 0 ? 1 / dirZ : Number.POSITIVE_INFINITY;

  let tMin = 0;
  let tMax = distance;

  const tx1 = (box.minX - originX) * invX;
  const tx2 = (box.maxX - originX) * invX;
  tMin = Math.max(tMin, Math.min(tx1, tx2));
  tMax = Math.min(tMax, Math.max(tx1, tx2));

  const ty1 = (box.minY - originY) * invY;
  const ty2 = (box.maxY - originY) * invY;
  tMin = Math.max(tMin, Math.min(ty1, ty2));
  tMax = Math.min(tMax, Math.max(ty1, ty2));

  const tz1 = (box.minZ - originZ) * invZ;
  const tz2 = (box.maxZ - originZ) * invZ;
  tMin = Math.max(tMin, Math.min(tz1, tz2));
  tMax = Math.min(tMax, Math.max(tz1, tz2));

  return tMax >= tMin && tMax >= 0;
}
