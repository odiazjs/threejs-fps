import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
import {
  pickBatchTeamSpawns,
  pickFarthestTeamRespawn,
  pickRandomTeamSpawn,
} from './spawnPick.js';
import { TDM_MAP_DEPTH, TDM_MAP_WIDTH } from './tdmMapConfig.js';

/** Chrono-Bowl TDM arena bounds (tdm_map.glb, centered at origin, floor at Y=0). */
export const MAP_HALF_X = TDM_MAP_WIDTH / 2;
export const MAP_HALF_Z = TDM_MAP_DEPTH / 2;

/** Largest extent — used for fog / coarse bounds. */
export const FLOOR_SIZE = Math.max(TDM_MAP_WIDTH, TDM_MAP_DEPTH);
export const MAP_HALF = FLOOR_SIZE / 2;

export interface TdmSpawnPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Baked positions of the `spawn_*` empties in tdm_map.glb — fallback until the
 * GLB (client) or bake JSON (server) registers the live list.
 */
const DEFAULT_TDM_SPAWNS: readonly TdmSpawnPoint[] = [
  { x: 0.0, z: -11.03 },
  { x: 12.4, z: -13.29 },
  { x: 20.73, z: -4.87 },
  { x: 20.73, z: -25.03 },
  { x: 3.32, z: -26.1 },
  { x: -7.76, z: -26.1 },
  { x: -10.61, z: -12.17 },
  { x: -21.21, z: -9.24 },
  { x: -21.88, z: 22.67 },
  { x: -12.77, z: 16.63 },
  { x: -5.5, z: 11.08 },
  { x: 4.62, z: 11.08 },
  { x: 22.04, z: 10.42 },
  { x: 15.21, z: 21.67 },
  { x: 15.21, z: 4.28 },
  { x: 22.95, z: 4.18 },
];

let registeredSpawns: readonly TdmSpawnPoint[] | null = null;

/** Register `spawn_*` marker positions (client: GLB load; server: bake JSON). */
export function setTdmMapSpawnPoints(points: readonly TdmSpawnPoint[]): void {
  if (points.length === 0) return;
  registeredSpawns = dedupeSpawns(points);
}

export function getTdmMapSpawnPoints(): readonly TdmSpawnPoint[] {
  return registeredSpawns ?? DEFAULT_TDM_SPAWNS;
}

function dedupeSpawns(points: readonly TdmSpawnPoint[]): TdmSpawnPoint[] {
  const seen = new Set<string>();
  const unique: TdmSpawnPoint[] = [];
  for (const point of points) {
    const key = `${point.x.toFixed(2)}|${point.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ x: point.x, z: point.z });
  }
  return unique;
}

const SPAWN_ZONE_SPREAD = { spreadX: 1.6, spreadZ: 1.6 } as const;

function toZone(point: TdmSpawnPoint): SpawnZone {
  return { x: point.x, z: point.z, ...SPAWN_ZONE_SPREAD };
}

/** Blue holds the north half (z < 0), red the south half (z > 0). */
function blueZones(): SpawnZone[] {
  return getTdmMapSpawnPoints().filter((p) => p.z < 0).map(toZone);
}

function redZones(): SpawnZone[] {
  return getTdmMapSpawnPoints().filter((p) => p.z >= 0).map(toZone);
}

/** 3rd/4th teams reuse opposite quadrants of the two halves. */
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
  return pool.length > 0 ? pool : getTdmMapSpawnPoints().map(toZone);
}

export const HUMAN_RESPAWN_POINT = DEFAULT_TDM_SPAWNS[0]!;

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

/** Playground / FFA — walk the full spawn list so players are spread out. */
export function pickSpawnPoint(
  playerIndex: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  const spawns = getTdmMapSpawnPoints();
  const zone = toZone(spawns[playerIndex % spawns.length]!);
  return pickRandomTeamSpawn([zone], context);
}

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
}

/** Open-floor pickup spots — validated against the baked collision boxes (1m clearance). */
export const TDM_MAP_AMMO_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -5, z: -12 },
  { x: -1, z: 12 },
];

export const TDM_MAP_SHIELD_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 12, z: -12 },
  { x: -11, z: 12 },
];

/** Eight grenade pickups — four per half, spread between lanes and edges. */
export const TDM_MAP_GRENADE_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -22, z: -10 },
  { x: 20, z: -8 },
  { x: 9, z: -14 },
  { x: -7, z: -28 },
  { x: -20, z: 24 },
  { x: 7, z: 14 },
  { x: -2, z: 20 },
  { x: 18, z: 6 },
];
