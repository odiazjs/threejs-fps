import type { Aabb } from './levelData.js';
import { getPlatformColliders } from './floatingPlatforms.js';
import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
import {
  pickBatchTeamSpawns,
  pickRandomTeamRespawn,
  pickRandomTeamSpawn,
} from './spawnPick.js';

export const FLOOR_SIZE = 120;
export const MAP_HALF = FLOOR_SIZE / 2;

const COLUMN_SIZE = 1.5;
const COLUMN_HEIGHT = 3;
const COLUMN_HALF = COLUMN_SIZE / 2;

export const COLUMN_POSITIONS = [
  { x: -40, z: -40 },
  { x: 40, z: -40 },
  { x: -40, z: 40 },
  { x: 40, z: 40 },
  { x: 0, z: 0 },
  { x: -40, z: 0 },
  { x: 40, z: 0 },
  { x: 0, z: -40 },
  { x: 0, z: 40 },
  { x: 28, z: 28 },
] as const;

const FFA_SPAWN_POOL: readonly SpawnZone[] = [
  { x: 0, z: -50, spreadX: 4, spreadZ: 4 },
  { x: 0, z: 50, spreadX: 4, spreadZ: 4 },
  { x: -50, z: 0, spreadX: 4, spreadZ: 4 },
  { x: 50, z: 0, spreadX: 4, spreadZ: 4 },
  { x: -44, z: -44, spreadX: 4, spreadZ: 4 },
  { x: 44, z: -44, spreadX: 4, spreadZ: 4 },
  { x: -44, z: 44, spreadX: 4, spreadZ: 4 },
  { x: 44, z: 44, spreadX: 4, spreadZ: 4 },
  { x: -30, z: 30, spreadX: 4, spreadZ: 4 },
  { x: 30, z: -30, spreadX: 4, spreadZ: 4 },
];

const TEAM_SPAWN_POOLS: ReadonlyArray<ReadonlyArray<SpawnZone>> = [
  [
    { x: -52, z: -38, spreadX: 4, spreadZ: 4 },
    { x: -48, z: -18, spreadX: 4, spreadZ: 4 },
    { x: -54, z: 2, spreadX: 4, spreadZ: 4 },
    { x: -46, z: 22, spreadX: 4, spreadZ: 4 },
    { x: -50, z: 42, spreadX: 4, spreadZ: 4 },
    { x: -42, z: 8, spreadX: 4, spreadZ: 4 },
    { x: -56, z: -8, spreadX: 4, spreadZ: 4 },
    { x: -44, z: 32, spreadX: 4, spreadZ: 4 },
  ],
  [
    { x: 52, z: 38, spreadX: 4, spreadZ: 4 },
    { x: 48, z: 18, spreadX: 4, spreadZ: 4 },
    { x: 54, z: -2, spreadX: 4, spreadZ: 4 },
    { x: 46, z: -22, spreadX: 4, spreadZ: 4 },
    { x: 50, z: -42, spreadX: 4, spreadZ: 4 },
    { x: 42, z: -8, spreadX: 4, spreadZ: 4 },
    { x: 56, z: 8, spreadX: 4, spreadZ: 4 },
    { x: 44, z: -32, spreadX: 4, spreadZ: 4 },
  ],
];

/** Fixed feet XZ for human respawns — keeps combat testing in one spot. */
export const HUMAN_RESPAWN_POINT = { x: 0, z: -50 } as const;

function teamPool(teamId: number): readonly SpawnZone[] {
  return TEAM_SPAWN_POOLS[teamId % TEAM_SPAWN_POOLS.length] ?? TEAM_SPAWN_POOLS[0]!;
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

function columnAabb(x: number, z: number): Aabb {
  return {
    minX: x - COLUMN_HALF,
    maxX: x + COLUMN_HALF,
    minY: 0,
    maxY: COLUMN_HEIGHT,
    minZ: z - COLUMN_HALF,
    maxZ: z + COLUMN_HALF,
  };
}

export function getLevelColliders(): Aabb[] {
  return [
    ...COLUMN_POSITIONS.map(({ x, z }) => columnAabb(x, z)),
    ...getPlatformColliders(),
  ];
}
