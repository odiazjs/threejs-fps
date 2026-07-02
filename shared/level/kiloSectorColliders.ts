import type { Aabb } from './levelData.js';
import { getPlatformColliders } from './floatingPlatforms.js';
import { pickFarthestSpawn } from './spawnPick.js';

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

const SPAWN_POINTS = [
  { x: 0, z: -50 },
  { x: 0, z: 50 },
  { x: -50, z: 0 },
  { x: 50, z: 0 },
  { x: -44, z: -44 },
  { x: 44, z: -44 },
  { x: -44, z: 44 },
  { x: 44, z: 44 },
  { x: -30, z: 30 },
  { x: 30, z: -30 },
] as const;

const TEAM_SPAWNS: ReadonlyArray<ReadonlyArray<{ x: number; z: number }>> = [
  [
    { x: -52, z: -38 },
    { x: -48, z: -18 },
    { x: -54, z: 2 },
    { x: -46, z: 22 },
    { x: -50, z: 42 },
    { x: -42, z: 8 },
    { x: -56, z: -8 },
    { x: -44, z: 32 },
  ],
  [
    { x: 52, z: 38 },
    { x: 48, z: 18 },
    { x: 54, z: -2 },
    { x: 46, z: -22 },
    { x: 50, z: -42 },
    { x: 42, z: -8 },
    { x: 56, z: 8 },
    { x: 44, z: -32 },
  ],
];

/** Fixed feet XZ for human respawns — keeps combat testing in one spot. */
export const HUMAN_RESPAWN_POINT = { x: 0, z: -50 } as const;

function jitterSpawn(spawn: { x: number; z: number }, spread = 2): { x: number; z: number } {
  return {
    x: spawn.x + (Math.random() - 0.5) * spread,
    z: spawn.z + (Math.random() - 0.5) * spread,
  };
}

export function pickTeamSpawnPoint(
  teamId: number,
  indexOnTeam: number,
): { x: number; z: number } {
  const spawns = TEAM_SPAWNS[teamId % TEAM_SPAWNS.length] ?? TEAM_SPAWNS[0]!;
  const spawn = spawns[indexOnTeam % spawns.length] ?? spawns[0]!;
  return jitterSpawn(spawn);
}

export function pickTeamRespawnPoint(
  teamId: number,
  deathPosition: { x: number; z: number },
): { x: number; z: number } {
  const spawns = TEAM_SPAWNS[teamId % TEAM_SPAWNS.length] ?? TEAM_SPAWNS[0]!;
  const spawn = pickFarthestSpawn(spawns, deathPosition.x, deathPosition.z);
  return jitterSpawn(spawn);
}

export function pickSpawnPoint(playerIndex: number): { x: number; z: number } {
  const spawn = SPAWN_POINTS[playerIndex % SPAWN_POINTS.length];
  return jitterSpawn(spawn);
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
