import type { OrientedBoxCollider } from './killhouseServerColliders.js';

/**
 * Tall invisible walls sitting on the crest of harvest perimeter `hill_wall*`
 * ridges and the center `hill` mountain so players cannot jump out of bounds.
 *
 * Poses measured from `harvest_map.glb` at {@link HARVEST_MAP_SCALE} (1.25).
 */

/** Half-height of the anti-climb barrier (total height = 2 × this). */
const BARRIER_HALF_Y = 12;
/** Crest Y of perimeter hill walls (AABB maxY ? 4.76). */
const WALL_CREST_Y = 4.6;
/** Crest Y of center mountain (AABB maxY ? 9.27). */
const HILL_CREST_Y = 9.0;

const WALL_CENTER_Y = WALL_CREST_Y + BARRIER_HALF_Y;
const HILL_CENTER_Y = HILL_CREST_Y + BARRIER_HALF_Y;

/** Local half-extents for N/S walls (yaw 0): long X, thin Z. */
const WALL_HALF_LEN = 26;
const WALL_HALF_THICK = 1.55;

/** Center mountain summit blocker (keeps lower slopes walkable). */
const HILL_HALF_XZ = 5.75;

function wallBarrier(
  centerX: number,
  centerZ: number,
  rotationY: number,
): OrientedBoxCollider {
  return {
    centerX,
    centerY: WALL_CENTER_Y,
    centerZ,
    halfX: WALL_HALF_LEN,
    halfY: BARRIER_HALF_Y,
    halfZ: WALL_HALF_THICK,
    rotationY,
  };
}

/** Oriented cuboids for Harvest out-of-bounds prevention. */
export function buildHarvestHillColliders(): OrientedBoxCollider[] {
  return [
    // South `hill_wall`
    wallBarrier(0, -28.435, 0),
    // North `hill_wall_1`
    wallBarrier(0, 28.273, 0),
    // East `hill_wall_2` (yaw 90° ? local length along world Z)
    wallBarrier(26.607, -0.1924, Math.PI / 2),
    // West `hill_wall_3` (use AABB center Z)
    wallBarrier(-26.3433, 0.5473, Math.PI / 2),
    // Center mountain `hill` summit
    {
      centerX: 0.8848,
      centerY: HILL_CENTER_Y,
      centerZ: 0,
      halfX: HILL_HALF_XZ,
      halfY: BARRIER_HALF_Y,
      halfZ: HILL_HALF_XZ,
      rotationY: 0,
    },
  ];
}
