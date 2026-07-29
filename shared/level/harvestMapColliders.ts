import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
import {
  pickBatchTeamSpawns,
  pickFarthestTeamRespawn,
  pickRandomTeamSpawn,
} from './spawnPick.js';
import { HARVEST_MAP_DEPTH, HARVEST_MAP_SCALE, HARVEST_MAP_WIDTH } from './harvestMapConfig.js';

/** Harvest arena bounds (harvest_map.glb). */
export const MAP_HALF_X = HARVEST_MAP_WIDTH / 2;
export const MAP_HALF_Z = HARVEST_MAP_DEPTH / 2;

export const FLOOR_SIZE = Math.max(HARVEST_MAP_WIDTH, HARVEST_MAP_DEPTH);
export const MAP_HALF = FLOOR_SIZE / 2;

export interface HarvestSpawnPoint {
  readonly x: number;
  readonly z: number;
}

const S = HARVEST_MAP_SCALE;

/**
 * Fallback spawn list from harvest_map.glb `spawn` / `spawn_N` empties
 * (Orange half z > 0, Blue half z < 0), scaled with the map.
 */
const DEFAULT_HARVEST_SPAWNS: readonly HarvestSpawnPoint[] = [
  { x: 5.88 * S, z: 16.1 * S },
  { x: 1.41 * S, z: 16.99 * S },
  { x: 11.65 * S, z: 10.49 * S },
  { x: 16.12 * S, z: 12.16 * S },
  { x: -6.53 * S, z: 12.16 * S },
  { x: -1.56 * S, z: 7.86 * S },
  { x: -16.18 * S, z: 5.49 * S },
  { x: -12.56 * S, z: 17.43 * S },
  { x: 5.88 * S, z: -10.53 * S },
  { x: 1.41 * S, z: -9.64 * S },
  { x: 11.65 * S, z: -16.14 * S },
  { x: 13.14 * S, z: -15.31 * S },
  { x: -6.53 * S, z: -14.47 * S },
  { x: -1.56 * S, z: -17.41 * S },
  { x: -16.18 * S, z: -12.17 * S },
  { x: -12.56 * S, z: -5.86 * S },
];

let registeredSpawns: readonly HarvestSpawnPoint[] | null = null;

export function setHarvestMapSpawnPoints(points: readonly HarvestSpawnPoint[]): void {
  if (points.length === 0) return;
  registeredSpawns = dedupeSpawns(points);
}

export function getHarvestMapSpawnPoints(): readonly HarvestSpawnPoint[] {
  return registeredSpawns ?? DEFAULT_HARVEST_SPAWNS;
}

function dedupeSpawns(points: readonly HarvestSpawnPoint[]): HarvestSpawnPoint[] {
  const seen = new Set<string>();
  const unique: HarvestSpawnPoint[] = [];
  for (const point of points) {
    const key = `${point.x.toFixed(2)}|${point.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ x: point.x, z: point.z });
  }
  return unique;
}

const SPAWN_ZONE_SPREAD = { spreadX: 1.6, spreadZ: 1.6 } as const;

function toZone(point: HarvestSpawnPoint): SpawnZone {
  return { x: point.x, z: point.z, ...SPAWN_ZONE_SPREAD };
}

/** Blue holds the south half (z < 0), orange/red the north half (z >= 0). */
function blueZones(): SpawnZone[] {
  return getHarvestMapSpawnPoints().filter((p) => p.z < 0).map(toZone);
}

function redZones(): SpawnZone[] {
  return getHarvestMapSpawnPoints().filter((p) => p.z >= 0).map(toZone);
}

function greenZones(): SpawnZone[] {
  const zones = blueZones().filter((z) => z.x < 0);
  return zones.length > 0 ? zones : blueZones();
}

function purpleZones(): SpawnZone[] {
  const zones = redZones().filter((z) => z.x > 0);
  return zones.length > 0 ? zones : redZones();
}

function teamPool(teamId: number): readonly SpawnZone[] {
  const pools = [blueZones, redZones, greenZones, purpleZones];
  const pool = pools[teamId % pools.length]!();
  return pool.length > 0 ? pool : getHarvestMapSpawnPoints().map(toZone);
}

export const HUMAN_RESPAWN_POINT = DEFAULT_HARVEST_SPAWNS[0]!;

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
  return pickFarthestTeamRespawn(teamPool(teamId), deathPosition, context);
}

export function pickSpawnPoint(
  playerIndex: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  const spawns = getHarvestMapSpawnPoints();
  const zone = toZone(spawns[playerIndex % spawns.length]!);
  return pickRandomTeamSpawn([zone], context);
}

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
}

/** Temporary open-floor pickup spots near mid - refine with mode layout later. */
export const HARVEST_MAP_AMMO_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -4 * S, z: -8 * S },
  { x: 4 * S, z: 8 * S },
];

export const HARVEST_MAP_SHIELD_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 10 * S, z: -6 * S },
  { x: -10 * S, z: 6 * S },
];

export const HARVEST_MAP_GRENADE_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -14 * S, z: -10 * S },
  { x: 14 * S, z: 10 * S },
  { x: 8 * S, z: -12 * S },
  { x: -8 * S, z: 12 * S },
];
