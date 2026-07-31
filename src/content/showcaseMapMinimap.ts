import {
  parseShowcaseMapBakeMetadata,
  type ShowcaseMapBakeMetadata,
} from '../../shared/level/showcaseMapBake';
import { MAP_HALF_X, MAP_HALF_Z } from '../../shared/level/showcaseMapColliders';
import { SHOWCASE_MAP_METADATA_BAKE } from '../../shared/level/showcaseMapConfig';
import type { Aabb } from '../../shared/level/levelData';
import type { MinimapLayout } from '../ui/minimapTypes';

const MIN_OBSTACLE_HEIGHT = 0.6;
const TALL_OBSTACLE_HEIGHT = 1.6;

export async function loadShowcaseMapMinimapLayout(): Promise<MinimapLayout> {
  const response = await fetch(`/3d/${SHOWCASE_MAP_METADATA_BAKE}`);
  if (!response.ok) {
    throw new Error(`Failed to load Showcase minimap bake (${response.status})`);
  }
  return buildShowcaseMapMinimapLayout(
    parseShowcaseMapBakeMetadata(await response.text()),
  );
}

export function buildShowcaseMapMinimapLayout(
  metadata: ShowcaseMapBakeMetadata,
): MinimapLayout {
  return {
    label: 'SHOWCASE',
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
