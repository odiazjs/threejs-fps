import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
import {
  pickBatchTeamSpawns,
  pickRandomTeamSpawn,
  pickRandomTeamRespawn,
} from './spawnPick.js';
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
const TEAM_SPAWN_SPREAD = { spreadX: 2.5, spreadZ: 2.5 } as const;

let registeredSpawn: { x: number; z: number } | null = null;

/** Set from `spawn_1` in the GLB after the map is loaded and prepared. */
export function setFiringRangeSpawnPoint(x: number, z: number): void {
  registeredSpawn = { x, z };
}

export function getFiringRangeSpawnPoint(): { x: number; z: number } {
  return registeredSpawn ?? DEFAULT_SPAWN;
}

function sandboxSpawnZone(): SpawnZone {
  const base = getFiringRangeSpawnPoint();
  return { x: base.x, z: base.z, ...SPAWN_SPREAD };
}

const BLUE_SPAWN_POOL: readonly SpawnZone[] = [
  { x: -14, z: -6, ...TEAM_SPAWN_SPREAD },
  { x: -14, z: 5, ...TEAM_SPAWN_SPREAD },
];
const RED_SPAWN_POOL: readonly SpawnZone[] = [
  { x: 14, z: -6, ...TEAM_SPAWN_SPREAD },
  { x: 14, z: 5, ...TEAM_SPAWN_SPREAD },
];
const GREEN_SPAWN_POOL: readonly SpawnZone[] = [{ x: -14, z: 5, ...TEAM_SPAWN_SPREAD }];
const PURPLE_SPAWN_POOL: readonly SpawnZone[] = [{ x: 14, z: -6, ...TEAM_SPAWN_SPREAD }];

const TEAM_SPAWN_POOLS: ReadonlyArray<ReadonlyArray<SpawnZone>> = [
  BLUE_SPAWN_POOL,
  RED_SPAWN_POOL,
  GREEN_SPAWN_POOL,
  PURPLE_SPAWN_POOL,
];

function teamPool(teamId: number): readonly SpawnZone[] {
  return TEAM_SPAWN_POOLS[teamId % TEAM_SPAWN_POOLS.length] ?? BLUE_SPAWN_POOL;
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
  return pickRandomTeamSpawn([sandboxSpawnZone()], context);
}

export function pickTeamSpawnPoint(
  teamId: number,
  indexOnTeam: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  const pool = teamPool(teamId);
  const playersOnTeam = context.playersOnTeam ?? indexOnTeam + 1;
  return pickRandomTeamSpawn(pool, { ...context, playersOnTeam });
}

export function pickTeamSpawnBatch(
  teamId: number,
  count: number,
  context: SpawnPickContext = {},
): Array<{ x: number; z: number }> {
  return pickBatchTeamSpawns(teamPool(teamId), count, context);
}

export function pickTeamRespawnPoint(
  teamId: number,
  deathPosition: { x: number; z: number },
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickRandomTeamRespawn(teamPool(teamId), deathPosition, context);
}
