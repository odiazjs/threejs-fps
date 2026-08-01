import type { Aabb } from './levelData.js';
import {
  setHarvestMapSpawnPoints,
  setHarvestMapTeamSpawnPoints,
  type HarvestSpawnPoint,
} from './harvestMapColliders.js';

export const HARVEST_MAP_BAKE_VERSION = 2;

export interface HarvestMapBakeMetadata {
  version: 2;
  spawns: HarvestSpawnPoint[];
  blueSpawns: HarvestSpawnPoint[];
  orangeSpawns: HarvestSpawnPoint[];
  structuralBoxes: Aabb[];
}

export function applyHarvestMapServerBake(metadata: HarvestMapBakeMetadata): void {
  if (
    Array.isArray(metadata.blueSpawns) &&
    Array.isArray(metadata.orangeSpawns) &&
    (metadata.blueSpawns.length > 0 || metadata.orangeSpawns.length > 0)
  ) {
    setHarvestMapTeamSpawnPoints(metadata.blueSpawns, metadata.orangeSpawns);
    return;
  }
  setHarvestMapSpawnPoints(metadata.spawns);
}

export function parseHarvestMapBakeMetadata(raw: string): HarvestMapBakeMetadata {
  const data = JSON.parse(raw) as {
    version: number;
    spawns?: HarvestSpawnPoint[];
    blueSpawns?: HarvestSpawnPoint[];
    orangeSpawns?: HarvestSpawnPoint[];
    structuralBoxes?: Aabb[];
  };
  if (data.version !== 1 && data.version !== HARVEST_MAP_BAKE_VERSION) {
    throw new Error(`Unsupported harvest map bake version: ${data.version}`);
  }
  if (!Array.isArray(data.spawns) || data.spawns.length === 0) {
    throw new Error(
      'harvest map bake is missing spawns � re-run `npm run bake:harvest-map`',
    );
  }
  if (!Array.isArray(data.structuralBoxes)) {
    throw new Error(
      'harvest map bake is missing structuralBoxes � re-run `npm run bake:harvest-map`',
    );
  }
  // Accept v1 bakes (no team pools) by normalizing to v2 shape.
  return {
    version: 2,
    spawns: data.spawns,
    blueSpawns: Array.isArray(data.blueSpawns) ? data.blueSpawns : [],
    orangeSpawns: Array.isArray(data.orangeSpawns) ? data.orangeSpawns : [],
    structuralBoxes: data.structuralBoxes,
  };
}
