import type { Aabb } from './levelData.js';

export { VOXEL_CELL, VOXEL_COLLIDER_SCALE } from './voxelColliderConfig.mjs';

function scaleAabbToward(
  box: Aabb,
  cx: number,
  cy: number,
  cz: number,
  scale: number,
): Aabb {
  const corners: [number, number, number][] = [
    [box.minX, box.minY, box.minZ],
    [box.minX, box.minY, box.maxZ],
    [box.minX, box.maxY, box.minZ],
    [box.minX, box.maxY, box.maxZ],
    [box.maxX, box.minY, box.minZ],
    [box.maxX, box.minY, box.maxZ],
    [box.maxX, box.maxY, box.minZ],
    [box.maxX, box.maxY, box.maxZ],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const [x, y, z] of corners) {
    const sx = cx + (x - cx) * scale;
    const sy = cy + (y - cy) * scale;
    const sz = cz + (z - cz) * scale;
    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    minZ = Math.min(minZ, sz);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
    maxZ = Math.max(maxZ, sz);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Scale every box in a local-module collider set toward the set's bounds center. */
export function scaleLocalColliderSet(
  boxes: readonly Aabb[],
  scale: number,
): readonly Aabb[] {
  if (scale === 1 || boxes.length === 0) return boxes;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    minZ = Math.min(minZ, box.minZ);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
    maxZ = Math.max(maxZ, box.maxZ);
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  return boxes.map((box) => scaleAabbToward(box, cx, cy, cz, scale));
}
