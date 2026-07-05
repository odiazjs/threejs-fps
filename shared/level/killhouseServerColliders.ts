import type { Aabb } from './levelData.js';
import {
  BIO_WALL_MODULE_DEPTH,
  BIO_WALL_MODULE_HEIGHT,
  BIO_WALL_MODULE_LENGTH,
  KILLHOUSE_SHIELD_PROP_HALF_X,
  KILLHOUSE_SHIELD_PROP_HALF_Z,
  KILLHOUSE_SHIELD_PROP_HEIGHT,
  KILLHOUSE_SHIELD_PROP_PLACEMENTS,
  PERIMETER_BIO_WALL_PLACEMENTS,
} from './killhouseSmallColliders.js';
import {
  BIO_GLASS_WALL_SIZE,
  BIO_MEDIUM_WALL_SIZE,
  KILLHOUSE_MAZE_WALL_PLACEMENTS,
  type MazeWallPlacement,
} from './killhouseMazeWalls.js';
import { createPlacedModuleAabb } from './placedModuleCollider.js';

/** Outward padding on server proxies — slightly larger than visuals to catch wall clips. */
export const KILLHOUSE_SERVER_PROXY_PADDING = 0.08;

function mazeModuleSize(placement: MazeWallPlacement) {
  return placement.kind === 'glass' ? BIO_GLASS_WALL_SIZE : BIO_MEDIUM_WALL_SIZE;
}

let cachedStaticColliders: Aabb[] | null = null;
let cachedServerColliders: Aabb[] | null = null;

/** Perimeter + maze module boxes — no shield props. */
export function getKillhouseStaticColliders(): Aabb[] {
  cachedStaticColliders ??= [
    ...PERIMETER_BIO_WALL_PLACEMENTS.map((placement) =>
      createPlacedModuleAabb(
        BIO_WALL_MODULE_LENGTH,
        BIO_WALL_MODULE_DEPTH,
        BIO_WALL_MODULE_HEIGHT,
        placement,
        KILLHOUSE_SERVER_PROXY_PADDING,
      ),
    ),
    ...KILLHOUSE_MAZE_WALL_PLACEMENTS.map((placement) => {
      const size = mazeModuleSize(placement);
      return createPlacedModuleAabb(
        size.length,
        size.depth,
        size.height,
        placement,
        KILLHOUSE_SERVER_PROXY_PADDING,
      );
    }),
  ];
  return cachedStaticColliders;
}

/**
 * Client AABB fallback before mesh BVH is ready.
 * Shield props are mesh-only on the client — omit their coarse module boxes.
 */
export function getKillhouseClientFallbackColliders(): Aabb[] {
  return getKillhouseStaticColliders();
}

/** Coarse per-module AABBs for server movement validation (includes shield proxies). */
export function getKillhouseServerColliders(): Aabb[] {
  cachedServerColliders ??= [
    ...getKillhouseStaticColliders(),
    ...KILLHOUSE_SHIELD_PROP_PLACEMENTS.map((placement) =>
      createPlacedModuleAabb(
        KILLHOUSE_SHIELD_PROP_HALF_X * 2,
        KILLHOUSE_SHIELD_PROP_HALF_Z * 2,
        KILLHOUSE_SHIELD_PROP_HEIGHT,
        placement,
        KILLHOUSE_SERVER_PROXY_PADDING,
      ),
    ),
  ];
  return cachedServerColliders;
}
