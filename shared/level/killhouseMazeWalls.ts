import type { Aabb } from './levelData.js';
import { BIO_GLASS_WALL_VOXEL_COLLIDERS } from './bioGlassWallVoxelColliders.js';
import { BIO_WALL_MEDIUM_VOXEL_COLLIDERS } from './bioWallMediumVoxelColliders.js';
import { transformPlacedVoxelColliders } from './placedVoxelCollider.js';

/** Same scale as perimeter bio_wall_basic / bio_glass_wall modules. */
export const KILLHOUSE_INTERIOR_WALL_SCALE = 0.02;

/** Scaled module sizes after prepareWallProp() alignment at KILLHOUSE_INTERIOR_WALL_SCALE. */
export const BIO_GLASS_WALL_SIZE = {
  length: 3.774,
  depth: 1.058,
  height: 3.394,
} as const;

export const BIO_MEDIUM_WALL_SIZE = {
  length: 3.792,
  depth: 1.118,
  height: 3.445,
} as const;

export type MazeWallKind = 'glass' | 'medium';

export interface MazeWallPlacement {
  x: number;
  z: number;
  rotationY: number;
  kind: MazeWallKind;
}

function moduleSize(kind: MazeWallKind) {
  return kind === 'glass' ? BIO_GLASS_WALL_SIZE : BIO_MEDIUM_WALL_SIZE;
}

function buildHorizontalRun(
  kind: MazeWallKind,
  z: number,
  minX: number,
  maxX: number,
  gaps: ReadonlyArray<readonly [number, number]> = [],
): MazeWallPlacement[] {
  const length = moduleSize(kind).length;
  const placements: MazeWallPlacement[] = [];

  for (let x = minX + length / 2; x <= maxX - length / 2 + 1e-6; x += length) {
    if (gaps.some(([gapMin, gapMax]) => x > gapMin - length / 2 && x < gapMax + length / 2)) {
      continue;
    }
    placements.push({ x, z, rotationY: 0, kind });
  }

  return placements;
}

function buildVerticalRun(
  kind: MazeWallKind,
  x: number,
  minZ: number,
  maxZ: number,
  gaps: ReadonlyArray<readonly [number, number]> = [],
): MazeWallPlacement[] {
  const length = moduleSize(kind).length;
  const placements: MazeWallPlacement[] = [];

  for (let z = minZ + length / 2; z <= maxZ - length / 2 + 1e-6; z += length) {
    if (gaps.some(([gapMin, gapMax]) => z > gapMin - length / 2 && z < gapMax + length / 2)) {
      continue;
    }
    placements.push({ x, z, rotationY: Math.PI / 2, kind });
  }

  return placements;
}

/** Playable interior — inset from perimeter bio_wall_basic shell. */
const INTERIOR_MIN_X = -18.5;
const INTERIOR_MAX_X = 18.5;
const INTERIOR_MIN_Z = -15;
const INTERIOR_MAX_Z = 15;

/** Central N/S and E/W connector corridors. */
const CENTER_CORRIDOR_GAP: readonly [readonly [number, number]] = [[-4, 4]];

/**
 * Chrono-Bowl interior hallways — medium corridor spines with glass at hub crossings.
 * Open quadrants; no enclosed room boxes.
 */
export const KILLHOUSE_MAZE_WALL_PLACEMENTS: readonly MazeWallPlacement[] = [
  ...buildHorizontalRun('medium', -10, INTERIOR_MIN_X, INTERIOR_MAX_X, CENTER_CORRIDOR_GAP),
  ...buildHorizontalRun('medium', 10, INTERIOR_MIN_X, INTERIOR_MAX_X, CENTER_CORRIDOR_GAP),
  ...buildVerticalRun('medium', -10, INTERIOR_MIN_Z, INTERIOR_MAX_Z, CENTER_CORRIDOR_GAP),
  ...buildVerticalRun('medium', 10, INTERIOR_MIN_Z, INTERIOR_MAX_Z, CENTER_CORRIDOR_GAP),

  ...buildHorizontalRun('glass', -10, -5.7, -1.9, []),
  ...buildHorizontalRun('glass', -10, 1.9, 5.7, []),
  ...buildHorizontalRun('glass', 10, -5.7, -1.9, []),
  ...buildHorizontalRun('glass', 10, 1.9, 5.7, []),
  ...buildVerticalRun('glass', -10, -5.7, -1.9, []),
  ...buildVerticalRun('glass', -10, 1.9, 5.7, []),
  ...buildVerticalRun('glass', 10, -5.7, -1.9, []),
  ...buildVerticalRun('glass', 10, 1.9, 5.7, []),
] as const;

export function getMazeWallCollidersAt(placement: MazeWallPlacement): Aabb[] {
  const voxels =
    placement.kind === 'glass'
      ? BIO_GLASS_WALL_VOXEL_COLLIDERS
      : BIO_WALL_MEDIUM_VOXEL_COLLIDERS;
  return transformPlacedVoxelColliders(voxels, placement);
}

/** World-space voxel colliders for interior maze/hallway wall modules (debug visualization). */
export function getKillhouseMazeWallColliders(): Aabb[] {
  return KILLHOUSE_MAZE_WALL_PLACEMENTS.flatMap(getMazeWallCollidersAt);
}
