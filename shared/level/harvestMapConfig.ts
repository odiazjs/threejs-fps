/** Plasma Harvest arena - GLB map (harvest_map.glb). */
export const HARVEST_MAP_MODEL = 'harvest_map.glb';
export const HARVEST_MAP_METADATA_BAKE = 'harvest_map_bake.json';
export const HARVEST_MAP_COLLISION_BAKE = 'harvest_map_collision.bin';
export const HARVEST_MAP_SCALE = 1.25;

/**
 * Playable footprint from harvest_map.glb world bounds at {@link HARVEST_MAP_SCALE}.
 * Unscaled authored extents were ~90 x 118.
 */
export const HARVEST_MAP_WIDTH = 90 * HARVEST_MAP_SCALE;
export const HARVEST_MAP_DEPTH = 118 * HARVEST_MAP_SCALE;
export const HARVEST_MAP_WALL_THICK = 0.55;
export const HARVEST_MAP_GROUND_THICK = 0.02;

/**
 * Actual player spawn empties are `spawn` / `spawn_N`.
 * Group markers like `Spawn_Points_Orange` must not count as spawns.
 */
export function isHarvestMapSpawnName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^spawn(_\d+)?$/i.test(name.trim());
}

/** RocksBG / rock_* / LOD rock meshes are environmental dressing. */
export function isHarvestMapBackgroundName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return (
    lower.startsWith('rocksbg') ||
    lower.startsWith('rock_') ||
    lower.startsWith('model_lod')
  );
}

/** Editor leftover character / mixamo armature - hide + no collision. */
export function isHarvestMapEditorJunkName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return (
    lower === 'player' ||
    lower === 'temp' ||
    lower.startsWith('mixamorig')
  );
}

/** Embedded GLB craft props - we spawn runtime FBX stations at these markers. */
export function isHarvestMapEmbeddedStationName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^crafting_station(_\d+)?$/i.test(name.trim());
}

/** Embedded harvesting crate markers — runtime FBX replaces them. */
export function isHarvestMapHarvestingBoxName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^harvesting_box_(orange|blue)$/i.test(name.trim());
}
