import {
  parseTdmMapBakeMetadata,
  type TdmMapBakeMetadata,
} from '../../shared/level/tdmMapBake';
import { MAP_HALF_X, MAP_HALF_Z } from '../../shared/level/tdmMapColliders';
import { TDM_MAP_METADATA_BAKE } from '../../shared/level/tdmMapConfig';
import type { Aabb } from '../../shared/level/levelData';
import type { MinimapLayout } from '../ui/minimapTypes';

/** Below this height an obstacle is walkable dressing, not a wall. */
const MIN_OBSTACLE_HEIGHT = 0.6;
const TALL_OBSTACLE_HEIGHT = 1.6;

export async function loadTdmMapMinimapLayout(): Promise<MinimapLayout> {
  const response = await fetch(`/3d/${TDM_MAP_METADATA_BAKE}`);
  if (!response.ok) {
    throw new Error(`Failed to load Chrono-Bowl minimap bake (${response.status})`);
  }
  return buildTdmMapMinimapLayout(parseTdmMapBakeMetadata(await response.text()));
}

export function buildTdmMapMinimapLayout(metadata: TdmMapBakeMetadata): MinimapLayout {
  return {
    label: 'CHRONO-BOWL',
    bounds: {
      minX: -MAP_HALF_X,
      maxX: MAP_HALF_X,
      minZ: -MAP_HALF_Z,
      maxZ: MAP_HALF_Z,
    },
    obstacles: metadata.structuralBoxes
      .filter((box) => box.maxY - box.minY > MIN_OBSTACLE_HEIGHT && box.minY < 1.5)
      .map(toStructureObstacle),
  };
}

function toStructureObstacle(box: Aabb) {
  return {
    minX: box.minX,
    maxX: box.maxX,
    minZ: box.minZ,
    maxZ: box.maxZ,
    tall: box.maxY - box.minY > TALL_OBSTACLE_HEIGHT,
    kind: 'structure' as const,
  };
}
