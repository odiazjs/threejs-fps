import type { Aabb } from './levelData.js';
import { getPlatformColliders } from './floatingPlatforms.js';

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

/** Fixed feet XZ for human respawns — keeps combat testing in one spot. */
export const HUMAN_RESPAWN_POINT = { x: 0, z: -50 } as const;

export function pickSpawnPoint(playerIndex: number): { x: number; z: number } {
  const spawn = SPAWN_POINTS[playerIndex % SPAWN_POINTS.length];
  return {
    x: spawn.x + (Math.random() - 0.5) * 2,
    z: spawn.z + (Math.random() - 0.5) * 2,
  };
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
