/** Chrono-Bowl TDM arena — GLB map (replaces the old FBX killhouse layout). */
export const TDM_MAP_MODEL = 'tdm_map.glb';
export const TDM_MAP_METADATA_BAKE = 'tdm_map_bake.json';
export const TDM_MAP_COLLISION_BAKE = 'tdm_map_collision.bin';
export const TDM_MAP_SCALE = 1;

/**
 * Playable arena footprint — perimeter wall extents of tdm_map.glb.
 * The GLB is authored centered at the origin with the floor at Y=0.
 */
export const TDM_MAP_WIDTH = 53.6;
export const TDM_MAP_DEPTH = 63.5;
export const TDM_MAP_WALL_THICK = 0.55;
export const TDM_MAP_GROUND_THICK = 0.02;

/** Empties named `spawn_*` mark every possible player spawn. */
export function isTdmMapSpawnName(name: string | undefined): boolean {
  return typeof name === 'string' && name.toLowerCase().startsWith('spawn');
}

/** Meshes named `bg_rock_*` are environmental dressing — never collidable. */
export function isTdmMapBackgroundName(name: string | undefined): boolean {
  return typeof name === 'string' && name.toLowerCase().startsWith('bg_rock');
}
