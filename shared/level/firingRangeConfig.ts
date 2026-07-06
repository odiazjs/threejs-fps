/** Editor-exported firing range scene (three.js editor → GLB). Drop into `3d/` and run `npm run sync:3d`. */
export const FIRING_RANGE_MODEL = 'firing_range_map.glb';

/** Uniform scale applied at load (editor export size × this factor). */
export const FIRING_RANGE_MAP_SCALE = 1;

/** Empty object name in the GLB used as the player spawn anchor. */
export const FIRING_RANGE_SPAWN_MARKER = 'spawn_1';

/** Base GLB object name for crate meshes (Three.js appends `_1`, `_2`, … for duplicates). */
export const FIRING_RANGE_CRATE_MARKER = 'crate_box';

const CRATE_BOX_DUPLICATE = /^crate_box_\d+$/;

/** True for `crate_box` and loader-renamed duplicates (`crate_box_1`, …). */
export function isFiringRangeCrateName(name: string): boolean {
  return name === FIRING_RANGE_CRATE_MARKER || CRATE_BOX_DUPLICATE.test(name);
}

const FIRING_RANGE_BASE_SIZE = 100;

/** Play bounds — scaled with the map so movement limits match the loaded GLB. */
export const FIRING_RANGE_WIDTH = FIRING_RANGE_BASE_SIZE * FIRING_RANGE_MAP_SCALE;
export const FIRING_RANGE_DEPTH = FIRING_RANGE_BASE_SIZE * FIRING_RANGE_MAP_SCALE;
export const FIRING_RANGE_GROUND_THICK = 0.02;
