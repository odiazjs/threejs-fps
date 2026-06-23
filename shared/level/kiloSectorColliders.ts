import type { Aabb } from './levelData.js';

export const FLOOR_SIZE = 60;
export const MAP_HALF = FLOOR_SIZE / 2;

const COLUMN_SIZE = 1.5;
const COLUMN_HEIGHT = 3;
const COLUMN_HALF = COLUMN_SIZE / 2;

const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 1.5;
const WALL_SPAN = FLOOR_SIZE + WALL_THICKNESS;
const WALL_OFFSET = MAP_HALF + WALL_THICKNESS / 2;

export const COLUMN_POSITIONS = [
  { x: -16, z: -16 },
  { x: 16, z: -16 },
  { x: -16, z: 16 },
  { x: 16, z: 16 },
  { x: 0, z: 0 },
  { x: -16, z: 0 },
  { x: 16, z: 0 },
  { x: 0, z: -16 },
  { x: 0, z: 16 },
  { x: 10, z: 10 },
] as const;

const SPAWN_POINTS = [
  { x: 0, z: -24 },
  { x: 0, z: 24 },
  { x: -24, z: 0 },
  { x: 24, z: 0 },
  { x: -20, z: -20 },
  { x: 20, z: -20 },
  { x: -20, z: 20 },
  { x: 20, z: 20 },
] as const;

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

function wallAabb(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): Aabb {
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: 0,
    maxY: WALL_HEIGHT,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  };
}

function getBoundaryColliders(): Aabb[] {
  const t = WALL_THICKNESS;
  const o = WALL_OFFSET;
  const span = WALL_SPAN;

  return [
    wallAabb(0, -o, span, t),
    wallAabb(0, o, span, t),
    wallAabb(-o, 0, t, span),
    wallAabb(o, 0, t, span),
  ];
}

export function getLevelColliders(): Aabb[] {
  return [
    ...COLUMN_POSITIONS.map(({ x, z }) => columnAabb(x, z)),
    ...getBoundaryColliders(),
  ];
}

export const BOUNDARY_WALL = {
  height: WALL_HEIGHT,
  thickness: WALL_THICKNESS,
  span: WALL_SPAN,
  offset: WALL_OFFSET,
  /** Lift wall meshes above the floor top to avoid z-fighting. */
  floorGap: 0.03,
} as const;
