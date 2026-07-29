import type { Aabb } from './levelData.js';
import {
  setHarvestMapSpawnPoints,
  type HarvestSpawnPoint,
} from './harvestMapColliders.js';

export const HARVEST_MAP_BAKE_VERSION = 1;

export interface HarvestMapBakeMetadata {
  version: 1;
  spawns: HarvestSpawnPoint[];
  structuralBoxes: Aabb[];
}

export function applyHarvestMapServerBake(metadata: HarvestMapBakeMetadata): void {
  setHarvestMapSpawnPoints(metadata.spawns);
}

export function parseHarvestMapBakeMetadata(raw: string): HarvestMapBakeMetadata {
  const data = JSON.parse(raw) as HarvestMapBakeMetadata;
  if (data.version !== HARVEST_MAP_BAKE_VERSION) {
    throw new Error(`Unsupported harvest map bake version: ${data.version}`);
  }
  if (!Array.isArray(data.spawns) || data.spawns.length === 0) {
    throw new Error(
      'harvest map bake is missing spawns — re-run `npm run bake:harvest-map`',
    );
  }
  if (!Array.isArray(data.structuralBoxes)) {
    throw new Error(
      'harvest map bake is missing structuralBoxes — re-run `npm run bake:harvest-map`',
    );
  }
  return data;
}
