import { setFiringRangeSpawnPoint } from './firingRangeColliders.js';
import {
  clearFiringRangeCrateColliders,
  registerFiringRangeCrateColliders,
} from './firingRangeCrateColliders.js';
import type { Aabb } from './levelData.js';
import {
  registerFiringRangePickupsFromCrates,
  type FiringRangeCrateTop,
} from './firingRangePickups.js';

export const FIRING_RANGE_METADATA_BAKE = 'firing_range_bake.json';

export interface FiringRangeBakeMetadata {
  version: 1;
  spawn: { x: number; z: number } | null;
  crateColliders: Aabb[];
  crateTops: FiringRangeCrateTop[];
  structuralBoxes: Aabb[];
}

export function applyFiringRangeServerBake(metadata: FiringRangeBakeMetadata): void {
  if (metadata.spawn) {
    setFiringRangeSpawnPoint(metadata.spawn.x, metadata.spawn.z);
  }

  clearFiringRangeCrateColliders();
  registerFiringRangeCrateColliders(metadata.crateColliders);
  registerFiringRangePickupsFromCrates(metadata.crateTops);
}

export function parseFiringRangeBakeMetadata(raw: string): FiringRangeBakeMetadata {
  const data = JSON.parse(raw) as FiringRangeBakeMetadata;
  if (data.version !== 1) {
    throw new Error(`Unsupported firing range bake metadata version: ${data.version}`);
  }
  if (!Array.isArray(data.structuralBoxes)) {
    throw new Error('Firing range bake metadata is missing structuralBoxes — re-run npm run bake:firing-range');
  }
  return data;
}
