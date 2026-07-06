import type { SpawnPickContext } from './spawnPick.js';
import { pickRandomTeamSpawn } from './spawnPick.js';
import {
  FIRING_RANGE_DEPTH,
  FIRING_RANGE_WIDTH,
} from './firingRangeConfig.js';

export const MAP_HALF_X = FIRING_RANGE_WIDTH / 2;
export const MAP_HALF_Z = FIRING_RANGE_DEPTH / 2;
export const FLOOR_SIZE = Math.max(FIRING_RANGE_WIDTH, FIRING_RANGE_DEPTH);
export const MAP_HALF = FLOOR_SIZE / 2;

const DEFAULT_SPAWN = { x: 0, z: 0 } as const;
const SPAWN_SPREAD = { spreadX: 3, spreadZ: 3 } as const;

let registeredSpawn: { x: number; z: number } | null = null;

/** Set from `spawn_1` in the GLB after the map is loaded and prepared. */
export function setFiringRangeSpawnPoint(x: number, z: number): void {
  registeredSpawn = { x, z };
}

export function getFiringRangeSpawnPoint(): { x: number; z: number } {
  return registeredSpawn ?? DEFAULT_SPAWN;
}

function spawnZone() {
  const base = getFiringRangeSpawnPoint();
  return { x: base.x, z: base.z, ...SPAWN_SPREAD };
}

export const HUMAN_RESPAWN_POINT = DEFAULT_SPAWN;

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
}

/** FFA / sandbox — spawn everyone near map center with light spread. */
export function pickSpawnPoint(
  _playerIndex: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickRandomTeamSpawn([spawnZone()], context);
}

export function pickTeamSpawnPoint(
  _teamId: number,
  _indexOnTeam: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickRandomTeamSpawn([spawnZone()], context);
}

export function pickTeamSpawnBatch(
  _teamId: number,
  count: number,
  context: SpawnPickContext = {},
): Array<{ x: number; z: number }> {
  return Array.from({ length: count }, () => pickSpawnPoint(0, context));
}

export function pickTeamRespawnPoint(
  _teamId: number,
  _deathPosition: { x: number; z: number },
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickSpawnPoint(0, context);
}
