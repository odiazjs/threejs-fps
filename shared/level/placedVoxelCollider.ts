import type { Aabb } from './levelData.js';
import {
  scaleLocalColliderSet,
  VOXEL_COLLIDER_SCALE,
} from './voxelColliderConfig.js';

export interface PlacedModuleCollider {
  x: number;
  z: number;
  rotationY: number;
}

function rotationYToQuarters(rotationY: number): number {
  const quarters = Math.round(rotationY / (Math.PI / 2));
  return ((quarters % 4) + 4) % 4;
}

function rotateLocalXZ(x: number, z: number, quarters: number): { x: number; z: number } {
  switch (quarters) {
    case 1:
      return { x: z, z: -x };
    case 2:
      return { x: -x, z: -z };
    case 3:
      return { x: -z, z: x };
    default:
      return { x, z };
  }
}

/** Rotate and translate local-module voxel boxes into world space. */
export function transformPlacedVoxelCollider(
  box: Aabb,
  placement: PlacedModuleCollider,
): Aabb {
  const quarters = rotationYToQuarters(placement.rotationY);
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

  for (const [lx, ly, lz] of corners) {
    const rotated = rotateLocalXZ(lx, lz, quarters);
    const wx = rotated.x + placement.x;
    const wy = ly;
    const wz = rotated.z + placement.z;
    minX = Math.min(minX, wx);
    minY = Math.min(minY, wy);
    minZ = Math.min(minZ, wz);
    maxX = Math.max(maxX, wx);
    maxY = Math.max(maxY, wy);
    maxZ = Math.max(maxZ, wz);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function transformPlacedVoxelColliders(
  boxes: readonly Aabb[],
  placement: PlacedModuleCollider,
  colliderScale = VOXEL_COLLIDER_SCALE,
): Aabb[] {
  const scaled = scaleLocalColliderSet(boxes, colliderScale);
  return scaled.map((box) => transformPlacedVoxelCollider(box, placement));
}
