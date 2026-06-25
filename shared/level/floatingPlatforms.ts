import type { Aabb } from './levelData.js';

export interface FloatingPlatformDef {
  x: number;
  z: number;
  /** Walkable top height in world units. */
  surfaceY: number;
  width: number;
  depth: number;
  thickness?: number;
}

export const PLATFORM_DEFAULT_THICKNESS = 0.32;

/** Jumpable platforms scattered for vertical gunplay (~1.2–1.5m from ground). */
export const FLOATING_PLATFORMS: readonly FloatingPlatformDef[] = [
  { x: -18, z: 22, surfaceY: 1.35, width: 4.5, depth: 4.5 },
  { x: 22, z: -18, surfaceY: 1.45, width: 5, depth: 4 },
  { x: -32, z: -18, surfaceY: 1.25, width: 4, depth: 4 },
  { x: 18, z: 32, surfaceY: 1.4, width: 4.5, depth: 3.5 },
  { x: -8, z: -28, surfaceY: 1.5, width: 3.5, depth: 3.5 },
  { x: 32, z: 8, surfaceY: 1.3, width: 4, depth: 5 },
  { x: -22, z: 38, surfaceY: 1.35, width: 4, depth: 4 },
  { x: 12, z: 12, surfaceY: 1.35, width: 3.2, depth: 3.2 },
  { x: 8, z: 8, surfaceY: 2.75, width: 3.5, depth: 3.5 },
  { x: -30, z: 5, surfaceY: 1.3, width: 3.2, depth: 3.2 },
  { x: -35, z: 5, surfaceY: 2.6, width: 3.5, depth: 3.5 },
  { x: 0, z: 24, surfaceY: 1.4, width: 5, depth: 3 },
] as const;

export function platformAabb(def: FloatingPlatformDef): Aabb {
  const halfW = def.width * 0.5;
  const halfD = def.depth * 0.5;
  const thickness = def.thickness ?? PLATFORM_DEFAULT_THICKNESS;

  return {
    minX: def.x - halfW,
    maxX: def.x + halfW,
    minY: def.surfaceY - thickness,
    maxY: def.surfaceY,
    minZ: def.z - halfD,
    maxZ: def.z + halfD,
    platform: true,
  };
}

export function getPlatformColliders(): Aabb[] {
  return FLOATING_PLATFORMS.map(platformAabb);
}
