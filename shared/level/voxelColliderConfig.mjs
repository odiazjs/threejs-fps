/** Global voxel bake settings — imported by scripts/bake-voxel-colliders.mjs. */

export const VOXEL_CELL = 0.1;

/**
 * Scales the entire voxel collider set toward its bounds center at runtime (1 = exact mesh fit).
 * 0.8 = 20% smaller overall — tweak without re-baking.
 */
export const VOXEL_COLLIDER_SCALE = 0.95;
