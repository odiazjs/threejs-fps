import type { Aabb } from './levelData.js';
import {
  setShowcaseMapSpawnPoint,
  type ShowcaseSpawnPoint,
} from './showcaseMapColliders.js';

export const SHOWCASE_MAP_BAKE_VERSION = 1;

export interface ShowcaseMapBakeMetadata {
  version: 1;
  /** World XZ of `player_spawn1`. */
  spawn: ShowcaseSpawnPoint | null;
  /** Per-mesh world AABBs (minimap + diagnostics). */
  structuralBoxes: Aabb[];
}

export function applyShowcaseMapServerBake(metadata: ShowcaseMapBakeMetadata): void {
  if (metadata.spawn) {
    setShowcaseMapSpawnPoint(metadata.spawn.x, metadata.spawn.z);
  }
}

export function parseShowcaseMapBakeMetadata(raw: string): ShowcaseMapBakeMetadata {
  const data = JSON.parse(raw) as ShowcaseMapBakeMetadata;
  if (data.version !== SHOWCASE_MAP_BAKE_VERSION) {
    throw new Error(`Unsupported showcase map bake version: ${data.version}`);
  }
  if (!data.spawn || !Number.isFinite(data.spawn.x) || !Number.isFinite(data.spawn.z)) {
    throw new Error(
      'showcase map bake is missing spawn � re-run `npm run bake:showcase-map`',
    );
  }
  if (!Array.isArray(data.structuralBoxes)) {
    throw new Error(
      'showcase map bake is missing structuralBoxes � re-run `npm run bake:showcase-map`',
    );
  }
  return data;
}
