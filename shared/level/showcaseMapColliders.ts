import type { SpawnPickContext } from './spawnPick.js';
import { pickRandomTeamSpawn } from './spawnPick.js';
import { SHOWCASE_MAP_DEPTH, SHOWCASE_MAP_WIDTH } from './showcaseMapConfig.js';

export const MAP_HALF_X = SHOWCASE_MAP_WIDTH / 2;
export const MAP_HALF_Z = SHOWCASE_MAP_DEPTH / 2;
export const FLOOR_SIZE = Math.max(SHOWCASE_MAP_WIDTH, SHOWCASE_MAP_DEPTH);
export const MAP_HALF = FLOOR_SIZE / 2;

export interface ShowcaseSpawnPoint {
  readonly x: number;
  readonly z: number;
}

/** Fallback until GLB / bake JSON registers `player_spawn`. */
const DEFAULT_SHOWCASE_SPAWN: ShowcaseSpawnPoint = { x: 9.81, z: -16.85 };

let registeredSpawn: ShowcaseSpawnPoint | null = null;

export function setShowcaseMapSpawnPoint(x: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  registeredSpawn = { x, z };
}

export function getShowcaseMapSpawnPoint(): ShowcaseSpawnPoint {
  return registeredSpawn ?? DEFAULT_SHOWCASE_SPAWN;
}

export const HUMAN_RESPAWN_POINT = DEFAULT_SHOWCASE_SPAWN;

const SPAWN_ZONE_SPREAD = { spreadX: 1.2, spreadZ: 1.2 } as const;

export function pickSpawnPoint(
  _playerIndex: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  const spawn = getShowcaseMapSpawnPoint();
  return pickRandomTeamSpawn(
    [{ x: spawn.x, z: spawn.z, ...SPAWN_ZONE_SPREAD }],
    context,
  );
}

export function pickTeamSpawnPoint(
  _teamId: number,
  _indexOnTeam: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickSpawnPoint(0, context);
}

export function pickTeamSpawnBatch(
  _teamId: number,
  count: number,
  context: SpawnPickContext = {},
): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    out.push(pickSpawnPoint(i, context));
  }
  return out;
}

export function pickTeamRespawnPoint(
  _teamId: number,
  _deathPosition: { x: number; z: number },
  context: SpawnPickContext = {},
): { x: number; z: number } {
  return pickSpawnPoint(0, context);
}

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
}

export const SHOWCASE_MAP_AMMO_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [];
export const SHOWCASE_MAP_SHIELD_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [];
export const SHOWCASE_MAP_GRENADE_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [];
