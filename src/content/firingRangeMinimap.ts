import {
  FIRING_RANGE_METADATA_BAKE,
  parseFiringRangeBakeMetadata,
  type FiringRangeBakeMetadata,
} from '../../shared/level/firingRangeBake';
import type { Aabb } from '../../shared/level/levelData';
import type { MinimapLayout } from '../ui/minimapTypes';

const PLAY_HALF = 20;
/** Top-down footprint for crate_box props on the minimap (world meters). */
const CRATE_MINIMAP_HALF = 0.38;

export async function loadFiringRangeMinimapLayout(): Promise<MinimapLayout> {
  const response = await fetch(`/3d/${FIRING_RANGE_METADATA_BAKE}`);
  if (!response.ok) {
    throw new Error(`Failed to load firing range minimap bake (${response.status})`);
  }
  return buildFiringRangeMinimapLayout(parseFiringRangeBakeMetadata(await response.text()));
}

export function buildFiringRangeMinimapLayout(metadata: FiringRangeBakeMetadata): MinimapLayout {
  const obstacles = [
    ...metadata.structuralBoxes
      .filter((box) => box.maxY - box.minY > 0.25)
      .map((box) => toStructureObstacle(box)),
    ...metadata.crateTops.map((top) => toCrateObstacle(top.x, top.z)),
  ];

  return {
    label: 'FIRING RANGE',
    bounds: {
      minX: -PLAY_HALF,
      maxX: PLAY_HALF,
      minZ: -PLAY_HALF,
      maxZ: PLAY_HALF,
    },
    obstacles,
  };
}

function toStructureObstacle(box: Aabb) {
  return {
    minX: box.minX,
    maxX: box.maxX,
    minZ: box.minZ,
    maxZ: box.maxZ,
    tall: true,
    kind: 'structure' as const,
  };
}

function toCrateObstacle(x: number, z: number) {
  return {
    minX: x - CRATE_MINIMAP_HALF,
    maxX: x + CRATE_MINIMAP_HALF,
    minZ: z - CRATE_MINIMAP_HALF,
    maxZ: z + CRATE_MINIMAP_HALF,
    tall: false,
    kind: 'crate' as const,
  };
}
