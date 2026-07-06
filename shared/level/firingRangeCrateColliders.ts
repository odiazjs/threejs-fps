import type { Aabb } from './levelData.js';

/** Shrink crate cuboids on XZ so walk gaps between adjacent crates stay clear. */
const CRATE_COLLIDER_HORIZONTAL_INSET = 0.04;

let crateColliders: Aabb[] = [];

export function registerFiringRangeCrateColliders(colliders: readonly Aabb[]): void {
  crateColliders = [...colliders];
}

export function getFiringRangeCrateColliders(): readonly Aabb[] {
  return crateColliders;
}

export function clearFiringRangeCrateColliders(): void {
  crateColliders = [];
}

export function insetCrateColliderAabb(
  box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
  inset = CRATE_COLLIDER_HORIZONTAL_INSET,
): Aabb | null {
  const minX = box.minX + inset;
  const maxX = box.maxX - inset;
  const minZ = box.minZ + inset;
  const maxZ = box.maxZ - inset;

  if (maxX - minX < 0.2 || maxZ - minZ < 0.2 || box.maxY - box.minY < 0.1) {
    return null;
  }

  return {
    minX,
    minY: box.minY,
    minZ,
    maxX,
    maxY: box.maxY,
    maxZ,
  };
}
