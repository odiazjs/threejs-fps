import type { Aabb } from './levelData.js';

const MAP_SCALE_X = 4;
const MAP_SCALE_Z = 4;

const LOCAL_SPAWN_POINTS = [
  { x: 0, z: -13 },
  { x: 0, z: 13 },
  { x: -13, z: 0 },
  { x: 13, z: 0 },
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: -10, z: 10 },
  { x: 10, z: 10 },
] as const;

export function pickSpawnPoint(playerIndex: number): { x: number; z: number } {
  const spawn = LOCAL_SPAWN_POINTS[playerIndex % LOCAL_SPAWN_POINTS.length];
  return {
    x: spawn.x * MAP_SCALE_X + (Math.random() - 0.5) * 4,
    z: spawn.z * MAP_SCALE_Z + (Math.random() - 0.5) * 4,
  };
}

interface BlockDef {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

const MAP_SCALE = 4;

function scaledBox(x: number, y: number, z: number, w: number, h: number, d: number): BlockDef {
  return {
    x: x * MAP_SCALE,
    y: y * MAP_SCALE,
    z: z * MAP_SCALE,
    width: w * MAP_SCALE,
    height: h * MAP_SCALE,
    depth: d * MAP_SCALE,
  };
}

function toAabb(block: BlockDef): Aabb {
  const halfW = block.width / 2;
  const halfH = block.height / 2;
  const halfD = block.depth / 2;

  return {
    minX: block.x - halfW,
    maxX: block.x + halfW,
    minY: block.y - halfH,
    maxY: block.y + halfH,
    minZ: block.z - halfD,
    maxZ: block.z + halfD,
  };
}

const COLLIDER_BLOCKS: BlockDef[] = [
  scaledBox(0, 1.5, 0, 4, 3, 4),
  scaledBox(0, 4, 0, 2.5, 2, 2.5),
  scaledBox(0, 0.3, -6, 1.6, 0.6, 6),
  scaledBox(0, 0.3, 6, 1.6, 0.6, 6),
  scaledBox(6, 0.3, 0, 6, 0.6, 1.6),
  scaledBox(-6, 0.3, 0, 6, 0.6, 1.6),
  scaledBox(7, 1.5, -7, 6, 3, 6),
  scaledBox(6, 2.25, -10.25, 8, 4.5, 1.5),
  scaledBox(10.25, 2.25, -6, 1.5, 4.5, 8),
  scaledBox(-3, 0.9, -3, 2.5, 1.8, 1.2),
  scaledBox(4, 0.6, 3, 3.5, 1.2, 1.0),
  scaledBox(-5, 0.6, 4, 1.2, 1.2, 1.2),
  scaledBox(0, 0.9, -12, 2.5, 1.8, 1.2),
  scaledBox(0, 0.9, 12, 2.5, 1.8, 1.2),
  ...Array.from({ length: 6 }, (_, i) =>
    scaledBox(3.5, 0.25 + i * 0.5, -4 - i * 0.5, 2, 0.5, 0.5),
  ),
];

export function getLevelColliders(): Aabb[] {
  return COLLIDER_BLOCKS.map(toAabb);
}
