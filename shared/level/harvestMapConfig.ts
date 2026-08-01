/** Plasma Harvest arena - GLB map (harvest_map.glb). */
export const HARVEST_MAP_MODEL = 'harvest_map.glb';
export const HARVEST_MAP_METADATA_BAKE = 'harvest_map_bake.json';
export const HARVEST_MAP_COLLISION_BAKE = 'harvest_map_collision.bin';
export const HARVEST_MAP_SCALE = 1;

/**
 * Playable footprint from bake bounds of harvest_map.glb.
 * Values are world extents after prepare (scale + ground-align).
 */
export const HARVEST_MAP_WIDTH = 61;
export const HARVEST_MAP_DEPTH = 55.3;
export const HARVEST_MAP_WALL_THICK = 0;
export const HARVEST_MAP_GROUND_THICK = 0.02;

/** Ceiling-mounted neon spotlights (pointing straight down). */
export const HARVEST_MAP_CEILING_Y = 7.25;
export const HARVEST_NEON_ORANGE = 0xff5a00;
export const HARVEST_NEON_BLUE = 0x2a8cff;

/**
 * Player spawn empties: `player_spawn` / `player_spawn_N`.
 * Team pools come from `blue_spawn_group` / `orange_spawn_group`.
 */
const HARVEST_SPAWN_NAME_RE = /^player_spawn(?:_\d+)?$/i;

export function isHarvestMapSpawnName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return HARVEST_SPAWN_NAME_RE.test(name.trim());
}

export function isHarvestMapBlueSpawnGroupName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return name.trim().toLowerCase() === 'blue_spawn_group';
}

export function isHarvestMapOrangeSpawnGroupName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return name.trim().toLowerCase() === 'orange_spawn_group';
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
  const lower = name.trim().toLowerCase();
  return (
    lower === 'character' ||
    lower.startsWith('character_') ||
    lower === 'player' ||
    lower === 'temp' ||
    lower.startsWith('mixamorig') ||
    isHarvestMapBlueSpawnGroupName(name) ||
    isHarvestMapOrangeSpawnGroupName(name)
  );
}

/**
 * Crafting-station placement empties:
 * `crafting_station_1`, `crafting_station_1_1`, `crafting_station_1_2`, �
 */
export function isHarvestMapEmbeddedStationName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^crafting_station(?:_\d+)+$/i.test(name.trim());
}

/** Embedded station mesh in the GLB � runtime loads crafting_station_2.glb. */
export function isHarvestMapEmbeddedStationPropName(
  name: string | undefined,
): boolean {
  if (typeof name !== 'string') return false;
  const lower = name.trim().toLowerCase();
  return lower === 'crafting_station_2glb' || lower.includes('crafting_station_2');
}

/**
 * Harvesting-box home markers (not install spots).
 * Prefers `harvesting_box_blue_1` when present; also accepts `harvesting_box_blue`.
 */
export function isHarvestMapHarvestingBoxName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  const lower = name.trim().toLowerCase();
  if (lower.endsWith('_install')) return false;
  return (
    lower === 'harvesting_box_orange' ||
    lower === 'harvesting_box_blue' ||
    /^harvesting_box_blue_\d+$/i.test(lower)
  );
}

/** Install pad empties: `harvesting_box_blue_install` / `harvesting_box_orange_install`. */
export function isHarvestMapInstallBoxPosName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^harvesting_box_(orange|blue)_install$/i.test(name.trim());
}

/**
 * Team base placement markers (legacy � new harvest_map has no FBX bases).
 * Accepts `team_blue_base` / `team_orange_base` and legacy
 * `team_base_blue` / `team_base_orange`.
 */
export function isHarvestMapTeamBaseName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  return (
    /^team_(blue|orange)_base$/i.test(n) || /^team_base_(blue|orange)$/i.test(n)
  );
}

export function harvestTeamBaseTeamId(name: string | undefined): 0 | 1 | null {
  if (!isHarvestMapTeamBaseName(name)) return null;
  return /blue/i.test(name!) ? 0 : 1;
}

/** Legacy child of a team base: where that team's harvesting box spawns. */
export function isHarvestMapOwnBoxSpawnName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^base_own_box_spawn(_\d+)?$/i.test(name.trim());
}

/** Default world height for empty team-base markers (drives FBX uniform scale). */
export const HARVEST_TEAM_BASE_DEFAULT_HEIGHT = 5;

/** Center hill wall mesh replaced at runtime by Meshy FBX (legacy). */
export function isHarvestMapHillWallName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  return /^hill_wall$/i.test(name.trim());
}

/** Blue (+Z) faces midfield (?Z); orange (?Z) faces midfield (+Z). */
export function harvestSpawnYawForTeam(teamId: number): number {
  return teamId % 2 === 0 ? Math.PI : 0;
}
