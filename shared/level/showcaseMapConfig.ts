/** Showcase arena - GLB map (showcase_map.glb). */
export const SHOWCASE_MAP_MODEL = 'showcase_map.glb';
export const SHOWCASE_MAP_METADATA_BAKE = 'showcase_map_bake.json';
export const SHOWCASE_MAP_COLLISION_BAKE = 'showcase_map_collision.bin';
export const SHOWCASE_MAP_SCALE = 1;

/**
 * Playable footprint from bake bounds of showcase_map.glb.
 * Values are world extents after prepare (scale + ground-align).
 */
export const SHOWCASE_MAP_WIDTH = 81;
export const SHOWCASE_MAP_DEPTH = 56;
export const SHOWCASE_MAP_WALL_THICK = 0;
export const SHOWCASE_MAP_GROUND_THICK = 0.02;

/**
 * Preferred join spawn empty in the GLB.
 * Also accepts legacy `player_spawn1` and numbered `player_spawn_N`.
 */
export const SHOWCASE_MAP_SPAWN_MARKER = 'player_spawn';

/** Face opposite default +Z when spawning on Showcase. */
export const SHOWCASE_MAP_SPAWN_YAW = Math.PI;

/** Ceiling-mounted neon spotlights (pointing straight down). */
export const SHOWCASE_MAP_CEILING_Y = 7.25;
export const SHOWCASE_NEON_ORANGE = 0xff5a00;
export const SHOWCASE_NEON_BLUE = 0x2a8cff;

const SHOWCASE_SPAWN_NAME_RE = /^player_spawn(?:1|_\d+)?$/i;

export function isShowcaseMapSpawnName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return SHOWCASE_SPAWN_NAME_RE.test(name.trim());
}
