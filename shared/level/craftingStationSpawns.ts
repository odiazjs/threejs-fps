import type { MapId } from './maps.js';
import {
  isPlasmaHarvestGameMode,
  type GameMode,
} from '../combat/match.js';
import { HARVEST_MAP_SCALE } from './harvestMapConfig.js';
import type { OrientedBoxCollider } from './killhouseServerColliders.js';

export interface CraftingStationSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Yaw in radians - station face / interact front. */
  readonly yaw: number;
}

const S = HARVEST_MAP_SCALE;

/** Face toward map origin (used for outer / corner stations). */
function yawTowardOrigin(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

/**
 * Harvest team ends: orange south (z < 0), blue north (z >= 0).
 * Stations face toward midfield / origin.
 */
export function yawForHarvestCraftingStation(x: number, z: number): number {
  if (Math.hypot(x, z) < 12 * Math.max(S, 1)) {
    return z >= 0 ? Math.PI : 0;
  }
  return yawTowardOrigin(x, z);
}

/** Base authored height before the world scale bump. */
const STATION_BASE_HEIGHT = 2.2;
/** Runtime station height (base  1.20). */
export const CRAFTING_STATION_SCALE = 1.2;
export const CRAFTING_STATION_HEIGHT = STATION_BASE_HEIGHT * CRAFTING_STATION_SCALE;
/** Front interact point distance from station origin (scales with model). */
export const CRAFTING_STATION_FRONT_OFFSET = 0.85 * CRAFTING_STATION_SCALE;

/**
 * Local half-extents after normalize (feet at y=0). Footprint is approximate;
 * client may refine from the loaded mesh.
 */
export const CRAFTING_STATION_COLLISION_HALF = {
  halfX: 0.95 * CRAFTING_STATION_SCALE,
  halfY: CRAFTING_STATION_HEIGHT * 0.5,
  halfZ: 0.95 * CRAFTING_STATION_SCALE,
} as const;

/**
 * Fallback `crafting_station_*` marker xz from blue/orange side groups.
 * Y is unused for placement  stations sit on the ground (feet at y=0).
 */
const HARVEST_STATIONS: readonly CraftingStationSpawn[] = [
  {
    x: 24.49 * S,
    y: 0,
    z: 24.88 * S,
    yaw: yawForHarvestCraftingStation(24.49 * S, 24.88 * S),
  },
  {
    x: -4.74 * S,
    y: 0,
    z: 24.83 * S,
    yaw: yawForHarvestCraftingStation(-4.74 * S, 24.83 * S),
  },
  {
    x: -4.86 * S,
    y: 0,
    z: -24.82 * S,
    yaw: yawForHarvestCraftingStation(-4.86 * S, -24.82 * S),
  },
  {
    x: 24.36 * S,
    y: 0,
    z: -24.77 * S,
    yaw: yawForHarvestCraftingStation(24.36 * S, -24.77 * S),
  },
];

/**
 * Crafting stations for Plasma Harvest on the Harvest map.
 * Other modes do not spawn stations (feature is mode-gated).
 */
export function getCraftingStationSpawns(
  mapId: MapId,
  gameMode?: GameMode | string | null,
): readonly CraftingStationSpawn[] {
  if (!isPlasmaHarvestGameMode(gameMode)) return [];
  if (mapId !== 'harvest') return [];
  return HARVEST_STATIONS;
}

/** Oriented cuboids for player collision (feet on ground at spawn xz). */
export function buildCraftingStationColliders(
  spawns: readonly CraftingStationSpawn[],
  half: { halfX: number; halfY: number; halfZ: number } = CRAFTING_STATION_COLLISION_HALF,
): OrientedBoxCollider[] {
  return spawns.map((spawn) => ({
    centerX: spawn.x,
    centerY: half.halfY,
    centerZ: spawn.z,
    halfX: half.halfX,
    halfY: half.halfY,
    halfZ: half.halfZ,
    rotationY: spawn.yaw,
  }));
}
