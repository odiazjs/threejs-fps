import type { Aabb } from './levelData.js';
import {
  BIO_WALL_MODULE_DEPTH,
  BIO_WALL_MODULE_HEIGHT,
  BIO_WALL_MODULE_LENGTH,
  PERIMETER_BIO_WALL_PLACEMENTS,
} from './killhouseSmallColliders.js';
import { createPlacedModuleAabb } from './placedModuleCollider.js';

/** Outward padding on server proxies — slightly larger than visuals to catch wall clips. */
export const KILLHOUSE_SERVER_PROXY_PADDING = 0.08;

let cachedStaticColliders: Aabb[] | null = null;
let cachedServerColliders: Aabb[] | null = null;

/** Perimeter module boxes only — interior uses baked mesh collision on Chrono-Bowl. */
export function getKillhouseStaticColliders(): Aabb[] {
  cachedStaticColliders ??= PERIMETER_BIO_WALL_PLACEMENTS.map((placement) =>
    createPlacedModuleAabb(
      BIO_WALL_MODULE_LENGTH,
      BIO_WALL_MODULE_DEPTH,
      BIO_WALL_MODULE_HEIGHT,
      placement,
      KILLHOUSE_SERVER_PROXY_PADDING,
    ),
  );
  return cachedStaticColliders;
}

/** @deprecated Chrono-Bowl uses baked mesh collision; kept for debug tooling. */
export function getKillhouseClientFallbackColliders(): Aabb[] {
  return getKillhouseStaticColliders();
}

/** @deprecated Chrono-Bowl uses baked mesh collision; kept for debug tooling. */
export function getKillhouseServerColliders(): Aabb[] {
  cachedServerColliders ??= getKillhouseStaticColliders();
  return cachedServerColliders;
}
