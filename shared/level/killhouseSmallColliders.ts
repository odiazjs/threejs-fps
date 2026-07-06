import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
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

export const KILLHOUSE_GROUND_THICK = 0.02;

/** @deprecated Use KILLHOUSE_LAYOUT_* from killhouseLayout.ts */
export {
  KILLHOUSE_LAYOUT_HOUSE_SCALE as KILLHOUSE_FLAT_HOUSE_SCALE,
  KILLHOUSE_LAYOUT_HOUSE_VISUAL_MODEL as KILLHOUSE_FLAT_HOUSE_VISUAL_MODEL,
  KILLHOUSE_LAYOUT_HOUSE_COLLISION_MODEL as KILLHOUSE_FLAT_HOUSE_COLLISION_MODEL,
  KILLHOUSE_LAYOUT_HOUSE_COLLISION_LOD as KILLHOUSE_FLAT_HOUSE_COLLISION_LOD,
  KILLHOUSE_LAYOUT_HOUSE_VISUAL_LOD as KILLHOUSE_FLAT_HOUSE_VISUAL_LOD,
  KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS,
} from './killhouseLayout.js';

import { KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS } from './killhouseLayout.js';

/** First house placement — legacy single-house constant. */
export const KILLHOUSE_FLAT_HOUSE_POSITION = KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS[0]!;

const CORNER_SW = { x: -17, z: -12 } as const;
const CORNER_NE = { x: 17, z: 12 } as const;
const CORNER_NW = { x: -17, z: 12 } as const;
const CORNER_SE = { x: 17, z: -12 } as const;

const CORNER_SPAWN_SPREAD = { spreadX: 3, spreadZ: 3 } as const;

/** Inset from arena edge so spawns stay clear of perimeter bio walls. */
const TDM_SPAWN_INSET_X = 5.5;
const TDM_SPAWN_INSET_Z = 5;

function cornerZone(x: number, z: number): SpawnZone {
  return { x, z, ...CORNER_SPAWN_SPREAD };
}

function tdmTeamCornerZone(signX: -1 | 1, signZ: -1 | 1): SpawnZone {
  return {
    x: signX * (MAP_HALF_X - TDM_SPAWN_INSET_X),
    z: signZ * (MAP_HALF_Z - TDM_SPAWN_INSET_Z),
    ...CORNER_SPAWN_SPREAD,
  };
}

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

/** Playground / FFA — one corner per player (up to 4), away from the center building. */
const PLAYGROUND_SPAWN_POOL: readonly SpawnZone[] = [
  cornerZone(CORNER_SW.x, CORNER_SW.z),
  cornerZone(CORNER_NE.x, CORNER_NE.z),
  cornerZone(CORNER_NW.x, CORNER_NW.z),
  cornerZone(CORNER_SE.x, CORNER_SE.z),
];

/** TDM — blue west corners, red east corners (inset from perimeter cover). */
const BLUE_SPAWN_POOL: readonly SpawnZone[] = [
  tdmTeamCornerZone(-1, -1),
  tdmTeamCornerZone(-1, 1),
];
const RED_SPAWN_POOL: readonly SpawnZone[] = [
  tdmTeamCornerZone(1, -1),
  tdmTeamCornerZone(1, 1),
];
const GREEN_SPAWN_POOL: readonly SpawnZone[] = [tdmTeamCornerZone(-1, 1)];
const PURPLE_SPAWN_POOL: readonly SpawnZone[] = [tdmTeamCornerZone(1, -1)];

export const HUMAN_RESPAWN_POINT = CORNER_SW;

const TEAM_SPAWN_POOLS: ReadonlyArray<ReadonlyArray<SpawnZone>> = [
  BLUE_SPAWN_POOL,
  RED_SPAWN_POOL,
  GREEN_SPAWN_POOL,
  PURPLE_SPAWN_POOL,
];

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
  const zone = PLAYGROUND_SPAWN_POOL[playerIndex % PLAYGROUND_SPAWN_POOL.length]!;
  return pickRandomTeamSpawn([zone], context);
}

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
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
  { x: -6, z: -5 },
  { x: 6, z: 5 },
] as const;

export const KILLHOUSE_SHIELD_POSITIONS = [
  { x: -6, z: 5 },
  { x: 6, z: -5 },
] as const;
