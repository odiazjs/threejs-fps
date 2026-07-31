import type { OrientedBoxCollider } from './killhouseServerColliders.js';

/**
 * Legacy crest barriers for the old outdoor harvest_map hills.
 * The current indoor harvest_map.glb bounds itself — no extra walls.
 */
export function buildHarvestHillColliders(): OrientedBoxCollider[] {
  return [];
}
