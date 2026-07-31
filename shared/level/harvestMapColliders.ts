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
 * Fallback spawn list from harvest_map.glb team groups after prepare/ground-align
 * (blue_spawn_group at +Z, orange_spawn_group at −Z).
 */
const DEFAULT_BLUE_SPAWNS: readonly HarvestSpawnPoint[] = [
  { x: 9.81 * S, z: 11.65 * S },
  { x: -3.7 * S, z: 11.65 * S },
  { x: 23.18 * S, z: 11.65 * S },
  { x: 27.63 * S, z: 17.39 * S },
  { x: -8.66 * S, z: 19.5 * S },
  { x: -3.34 * S, z: 6.97 * S },
  { x: 23.15 * S, z: 7.56 * S },
  { x: 9.81 * S, z: 7.7 * S },
];

const DEFAULT_ORANGE_SPAWNS: readonly HarvestSpawnPoint[] = [
  { x: 9.81 * S, z: -16.85 * S },
  { x: -3.7 * S, z: -16.85 * S },
  { x: 23.18 * S, z: -16.85 * S },
  { x: 27.63 * S, z: -11.11 * S },
  { x: -8.66 * S, z: -9 * S },
  { x: -3.34 * S, z: -21.53 * S },
  { x: 23.15 * S, z: -20.94 * S },
  { x: 9.81 * S, z: -20.8 * S },
];

const DEFAULT_HARVEST_SPAWNS: readonly HarvestSpawnPoint[] = [
  ...DEFAULT_BLUE_SPAWNS,
  ...DEFAULT_ORANGE_SPAWNS,
];

let registeredSpawns: readonly HarvestSpawnPoint[] | null = null;
let registeredBlueSpawns: readonly HarvestSpawnPoint[] | null = null;
let registeredOrangeSpawns: readonly HarvestSpawnPoint[] | null = null;

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

/** Register a flat spawn list (legacy bake). Team pools fall back to Z-split. */
export function setHarvestMapSpawnPoints(points: readonly HarvestSpawnPoint[]): void {
  if (points.length === 0) return;
  registeredSpawns = dedupeSpawns(points);
  registeredBlueSpawns = null;
  registeredOrangeSpawns = null;
}

/** Register authored team spawn pools from blue/orange spawn groups. */
export function setHarvestMapTeamSpawnPoints(
  blue: readonly HarvestSpawnPoint[],
  orange: readonly HarvestSpawnPoint[],
): void {
  const blueUnique = dedupeSpawns(blue);
  const orangeUnique = dedupeSpawns(orange);
  if (blueUnique.length === 0 && orangeUnique.length === 0) return;
  registeredBlueSpawns = blueUnique.length > 0 ? blueUnique : null;
  registeredOrangeSpawns = orangeUnique.length > 0 ? orangeUnique : null;
  registeredSpawns = dedupeSpawns([...blueUnique, ...orangeUnique]);
}

export function getHarvestMapSpawnPoints(): readonly HarvestSpawnPoint[] {
  return registeredSpawns ?? DEFAULT_HARVEST_SPAWNS;
}

const SPAWN_ZONE_SPREAD = { spreadX: 1.6, spreadZ: 1.6 } as const;

function toZone(point: HarvestSpawnPoint): SpawnZone {
  return { x: point.x, z: point.z, ...SPAWN_ZONE_SPREAD };
}

function blueZones(): SpawnZone[] {
  const points = registeredBlueSpawns
    ?? getHarvestMapSpawnPoints().filter((p) => p.z >= 0);
  const zones = (points.length > 0 ? points : DEFAULT_BLUE_SPAWNS).map(toZone);
  return zones;
}

function redZones(): SpawnZone[] {
  const points = registeredOrangeSpawns
    ?? getHarvestMapSpawnPoints().filter((p) => p.z < 0);
  const zones = (points.length > 0 ? points : DEFAULT_ORANGE_SPAWNS).map(toZone);
  return zones;
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

export const HUMAN_RESPAWN_POINT = DEFAULT_BLUE_SPAWNS[0]!;

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
