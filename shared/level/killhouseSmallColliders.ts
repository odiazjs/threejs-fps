import type { Aabb } from './levelData.js';
import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
import { BIO_WALL_BASIC_VOXEL_COLLIDERS } from './bioWallBasicVoxelColliders.js';
import {
  getMazeWallCollidersAt,
  KILLHOUSE_MAZE_WALL_PLACEMENTS,
} from './killhouseMazeWalls.js';
import { transformPlacedVoxelColliders } from './placedVoxelCollider.js';
import { LOD_SHIELD_PROP_COLLIDERS } from './lodShieldPropColliders.js';
import {
  pickBatchTeamSpawns,
  pickRandomTeamRespawn,
  pickRandomTeamSpawn,
} from './spawnPick.js';

/** Chrono-Bowl 2v2 arena — compact rectangular killhouse. */
/**
 * Each wall is 3.80m wide, 3.10m length, and 0.45m thick.
 * So the wide part has a total of 12 walls, and the narrow part has a total of 10 walls.
 */
export const KILLHOUSE_WIDTH = 45.6;
export const KILLHOUSE_DEPTH = 38;
export const MAP_HALF_X = KILLHOUSE_WIDTH / 2;
export const MAP_HALF_Z = KILLHOUSE_DEPTH / 2;
export const KILLHOUSE_WALL_THICK = 0.45;

/** Largest extent — used for fog / coarse bounds until rectangular maps are wired everywhere. */
export const FLOOR_SIZE = Math.max(KILLHOUSE_WIDTH, KILLHOUSE_DEPTH);
export const MAP_HALF = FLOOR_SIZE / 2;

const MAP_INSET_X = 2.7;
const MAP_INSET_Z = 3.5;

/** bio_wall_basic.fbx bounds after center/ground alignment, before scale. */
const CENTER_BIO_WALL_MODEL_SIZE = {
  x: 189.91550207138062,
  y: 164.43270679385066,
  z: 53.65080360100366,
} as const;

export const KILLHOUSE_CENTER_WALL_SCALE = 0.02;

/** Matches wall prop scale for shield_pink_prop_1.fbx visual placement. */
export const KILLHOUSE_SHIELD_PROP_SCALE = 0.010;

/** Scaled lod_shield_prop.fbx (model_LOD3) voxel footprint half-extents at KILLHOUSE_SHIELD_PROP_SCALE. */
export const KILLHOUSE_SHIELD_PROP_HALF_X = 0.799;
export const KILLHOUSE_SHIELD_PROP_HALF_Z = 0.949;

export interface KillhouseShieldPropPlacement {
  x: number;
  z: number;
  /** Radians — 90° steps only (0, ±π/2, π). */
  rotationY: number;
}

/** Ten shield props across Chrono-Bowl — axis-aligned rotations, inside playable bounds. */
export const KILLHOUSE_SHIELD_PROP_PLACEMENTS: readonly KillhouseShieldPropPlacement[] = [
  { x: 0, z: 0, rotationY: 0 },
  { x: -14, z: -9, rotationY: Math.PI / 2 },
  { x: 14, z: -9, rotationY: Math.PI },
  { x: -14, z: 9, rotationY: -Math.PI / 2 },
  { x: 14, z: 9, rotationY: 0 },
  { x: -8, z: 0, rotationY: Math.PI / 2 },
  { x: 8, z: 0, rotationY: Math.PI },
  { x: 0, z: -11, rotationY: 0 },
  { x: 0, z: 11, rotationY: Math.PI / 2 },
  { x: -6, z: 6, rotationY: Math.PI },
] as const;

/** @deprecated Use KILLHOUSE_SHIELD_PROP_PLACEMENTS[0] */
export const KILLHOUSE_CENTER_SHIELD_PROP = {
  x: KILLHOUSE_SHIELD_PROP_PLACEMENTS[0]!.x,
  z: KILLHOUSE_SHIELD_PROP_PLACEMENTS[0]!.z,
} as const;

/** Module span along its long edge after scale — matches 12 × length = width, 10 × length = depth. */
export const BIO_WALL_MODULE_LENGTH =
  CENTER_BIO_WALL_MODEL_SIZE.x * KILLHOUSE_CENTER_WALL_SCALE;
export const BIO_WALL_MODULE_DEPTH =
  CENTER_BIO_WALL_MODEL_SIZE.z * KILLHOUSE_CENTER_WALL_SCALE;
export const BIO_WALL_MODULE_HEIGHT =
  CENTER_BIO_WALL_MODEL_SIZE.y * KILLHOUSE_CENTER_WALL_SCALE;

export const KILLHOUSE_WIDTH_WALL_COUNT = 12;
export const KILLHOUSE_DEPTH_WALL_COUNT = 10;

export interface PerimeterBioWallPlacement {
  x: number;
  z: number;
  rotationY: number;
}

function buildWidthWallRun(
  z: number,
  rotationY: number,
): PerimeterBioWallPlacement[] {
  const start = -KILLHOUSE_WIDTH / 2 + BIO_WALL_MODULE_LENGTH / 2;
  const placements: PerimeterBioWallPlacement[] = [];
  for (let i = 0; i < KILLHOUSE_WIDTH_WALL_COUNT; i++) {
    placements.push({
      x: start + i * BIO_WALL_MODULE_LENGTH,
      z,
      rotationY,
    });
  }
  return placements;
}

function buildDepthWallRun(
  x: number,
  rotationY: number,
): PerimeterBioWallPlacement[] {
  const start = -KILLHOUSE_DEPTH / 2 + BIO_WALL_MODULE_LENGTH / 2;
  const placements: PerimeterBioWallPlacement[] = [];
  for (let i = 0; i < KILLHOUSE_DEPTH_WALL_COUNT; i++) {
    placements.push({
      x,
      z: start + i * BIO_WALL_MODULE_LENGTH,
      rotationY,
    });
  }
  return placements;
}

const northZ = -MAP_HALF_Z + KILLHOUSE_WALL_THICK / 2;
const southZ = MAP_HALF_Z - KILLHOUSE_WALL_THICK / 2;
const westX = -MAP_HALF_X + KILLHOUSE_WALL_THICK / 2;
const eastX = MAP_HALF_X - KILLHOUSE_WALL_THICK / 2;

/** Twelve modules per north/south edge, ten per west/east edge — natural scale, edge to edge. */
export const PERIMETER_BIO_WALL_PLACEMENTS: readonly PerimeterBioWallPlacement[] = [
  ...buildWidthWallRun(northZ, 0),
  ...buildWidthWallRun(southZ, Math.PI),
  ...buildDepthWallRun(westX, Math.PI / 2),
  ...buildDepthWallRun(eastX, -Math.PI / 2),
];

function getPerimeterWallCollidersAt(placement: PerimeterBioWallPlacement): Aabb[] {
  return transformPlacedVoxelColliders(BIO_WALL_BASIC_VOXEL_COLLIDERS, placement);
}

/** Chrono-Bowl spawn pools — B1–B6 (west) and R1–R6 (east) per arena layout. */
const BLUE_SPAWN_POOL: readonly SpawnZone[] = [
  { x: -20.52, z: -14.85, spreadX: 2.2, spreadZ: 2.6 },
  { x: -11.4, z: -0.59, spreadX: 2.55, spreadZ: 3.05 },
  { x: -18.97, z: 4.51, spreadX: 2.0, spreadZ: 3.55 },
  { x: -15.68, z: 8.55, spreadX: 2.4, spreadZ: 2.85 },
  { x: -18.7, z: 15.2, spreadX: 2.55, spreadZ: 2.6 },
  { x: -2.28, z: 1.43, spreadX: 2.4, spreadZ: 3.35 },
];

const RED_SPAWN_POOL: readonly SpawnZone[] = [
  { x: 20.52, z: 14.85, spreadX: 2.2, spreadZ: 2.6 },
  { x: 11.4, z: 0.59, spreadX: 2.55, spreadZ: 3.05 },
  { x: 15.96, z: 11.64, spreadX: 2.55, spreadZ: 3.05 },
  { x: 15.68, z: -3.33, spreadX: 2.4, spreadZ: 3.55 },
  { x: 3.19, z: 1.19, spreadX: 2.4, spreadZ: 3.35 },
  { x: 18.7, z: -15.2, spreadX: 2.55, spreadZ: 2.6 },
];

const GREEN_SPAWN_POOL: readonly SpawnZone[] = [
  { x: -16.87, z: 16.03, spreadX: 2.4, spreadZ: 2.85 },
  { x: -12.77, z: 16.86, spreadX: 2.2, spreadZ: 2.6 },
  { x: -20.06, z: 12.47, spreadX: 2.0, spreadZ: 3.05 },
  { x: -10.49, z: 14.01, spreadX: 2.55, spreadZ: 2.85 },
  { x: -18.24, z: 17.22, spreadX: 2.2, spreadZ: 2.35 },
  { x: -14.14, z: 10.09, spreadX: 2.4, spreadZ: 2.85 },
];

const PURPLE_SPAWN_POOL: readonly SpawnZone[] = [
  { x: 16.87, z: -16.03, spreadX: 2.4, spreadZ: 2.85 },
  { x: 12.77, z: -16.86, spreadX: 2.2, spreadZ: 2.6 },
  { x: 20.06, z: -12.47, spreadX: 2.0, spreadZ: 3.05 },
  { x: 10.49, z: -14.01, spreadX: 2.55, spreadZ: 2.85 },
  { x: 18.24, z: -17.22, spreadX: 2.2, spreadZ: 2.35 },
  { x: 14.14, z: -10.09, spreadX: 2.4, spreadZ: 2.85 },
];

const TEAM_SPAWN_POOLS: ReadonlyArray<ReadonlyArray<SpawnZone>> = [
  BLUE_SPAWN_POOL,
  RED_SPAWN_POOL,
  GREEN_SPAWN_POOL,
  PURPLE_SPAWN_POOL,
];

const FFA_SPAWN_POOL: readonly SpawnZone[] = [...BLUE_SPAWN_POOL, ...RED_SPAWN_POOL];

export const HUMAN_RESPAWN_POINT = { x: -17.33, z: -14.25 } as const;

function teamPool(teamId: number): readonly SpawnZone[] {
  return TEAM_SPAWN_POOLS[teamId % TEAM_SPAWN_POOLS.length] ?? BLUE_SPAWN_POOL;
}

export function pickTeamSpawnPoint(
  teamId: number,
  indexOnTeam: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  const pool = teamPool(teamId);
  const playersOnTeam = context.playersOnTeam ?? indexOnTeam + 1;
  return pickRandomTeamSpawn(pool, { ...context, playersOnTeam });
}

export function pickTeamSpawnBatch(
  teamId: number,
  count: number,
  context: SpawnPickContext = {},
): Array<{ x: number; z: number }> {
  return pickBatchTeamSpawns(teamPool(teamId), count, context);
}

export function pickTeamRespawnPoint(
  teamId: number,
  deathPosition: { x: number; z: number },
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickRandomTeamRespawn(teamPool(teamId), deathPosition, context);
}

export function pickSpawnPoint(
  playerIndex: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  void playerIndex;
  return pickRandomTeamSpawn(FFA_SPAWN_POOL, context);
}

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
}

function getShieldPropCollidersAt(placement: KillhouseShieldPropPlacement): Aabb[] {
  return transformPlacedVoxelColliders(LOD_SHIELD_PROP_COLLIDERS, placement);
}

/** World-space voxel colliders for perimeter bio_wall_basic modules (debug visualization). */
export function getKillhousePerimeterWallColliders(): Aabb[] {
  return PERIMETER_BIO_WALL_PLACEMENTS.flatMap(getPerimeterWallCollidersAt);
}

/** World-space LOD voxel colliders for all shield prop placements (debug visualization). */
export function getKillhouseShieldPropWorldColliders(): Aabb[] {
  return KILLHOUSE_SHIELD_PROP_PLACEMENTS.flatMap(getShieldPropCollidersAt);
}

let cachedColliders: Aabb[] | null = null;

export function getLevelColliders(): Aabb[] {
  cachedColliders ??= [
    ...PERIMETER_BIO_WALL_PLACEMENTS.flatMap(getPerimeterWallCollidersAt),
    ...KILLHOUSE_MAZE_WALL_PLACEMENTS.flatMap(getMazeWallCollidersAt),
    ...KILLHOUSE_SHIELD_PROP_PLACEMENTS.flatMap(getShieldPropCollidersAt),
  ];
  return cachedColliders;
}

export function isInsideKillhouseBounds(
  x: number,
  z: number,
  paddingX = MAP_INSET_X,
  paddingZ = MAP_INSET_Z,
): boolean {
  const limitX = MAP_HALF_X - paddingX;
  const limitZ = MAP_HALF_Z - paddingZ;
  return Math.abs(x) <= limitX && Math.abs(z) <= limitZ;
}

export const KILLHOUSE_AMMO_POSITIONS = [
  { x: 0, z: 0 },
  { x: -12.77, z: -9.5 },
  { x: 12.77, z: 7.13 },
  { x: -5.47, z: 11.87 },
] as const;

export const KILLHOUSE_SHIELD_POSITIONS = [
  { x: 9.12, z: -9.5 },
  { x: -10.94, z: 4.75 },
] as const;
