import type { Aabb } from './levelData.js';
import { setTdmMapSpawnPoints, type TdmSpawnPoint } from './tdmMapColliders.js';

export const TDM_MAP_BAKE_VERSION = 1;

/**
 * Small metadata bake (tdm_map_bake.json). The decimated collision trimesh
 * lives in a separate KHC1 binary (tdm_map_collision.bin) so the minimap
 * fetch stays lightweight.
 */
export interface TdmMapBakeMetadata {
  version: 1;
  /** World XZ of every `spawn_*` empty in tdm_map.glb. */
  spawns: TdmSpawnPoint[];
  /** Per-mesh world AABBs (minimap + diagnostics) — excludes bg_rock_* dressing. */
  structuralBoxes: Aabb[];
}

export function applyTdmMapServerBake(metadata: TdmMapBakeMetadata): void {
  setTdmMapSpawnPoints(metadata.spawns);
}

export function parseTdmMapBakeMetadata(raw: string): TdmMapBakeMetadata {
  const data = JSON.parse(raw) as TdmMapBakeMetadata;
  if (data.version !== TDM_MAP_BAKE_VERSION) {
    throw new Error(`Unsupported tdm map bake version: ${data.version}`);
  }
  if (!Array.isArray(data.spawns) || data.spawns.length === 0) {
    throw new Error('tdm map bake is missing spawns — re-run `npm run bake:tdm-map`');
  }
  if (!Array.isArray(data.structuralBoxes)) {
    throw new Error('tdm map bake is missing structuralBoxes — re-run `npm run bake:tdm-map`');
  }
  return data;
}
