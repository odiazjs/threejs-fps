import { HARVEST_TEAM_BASE_DEFAULT_HEIGHT } from './harvestMapConfig.js';

export interface TeamBaseSpawn {
  readonly teamId: 0 | 1;
  readonly x: number;
  readonly z: number;
  /** Yaw in radians (Y-up). */
  readonly yaw: number;
}

/**
 * World AABB of `team_base_*_2.fbx` after normalize + height match to
 * {@link HARVEST_TEAM_BASE_DEFAULT_HEIGHT}.
 */
export const TEAM_BASE_WORLD_SIZE = {
  x: 9.078018,
  y: HARVEST_TEAM_BASE_DEFAULT_HEIGHT,
  z: 8.138307,
} as const;

/**
 * Poses from `team_blue_base` / `team_orange_base` empties
 * (world coords after {@link HARVEST_MAP_SCALE}). Feet at y=0.
 * Collision for these is baked into `harvest_map_collision.bin`.
 */
const HARVEST_TEAM_BASES: readonly TeamBaseSpawn[] = [
  { teamId: 0, x: -16.019567, z: -19.410256, yaw: 0 },
  { teamId: 1, x: 17.129193, z: 19.209421, yaw: Math.PI },
];

export function getTeamBaseSpawns(): readonly TeamBaseSpawn[] {
  return HARVEST_TEAM_BASES;
}
