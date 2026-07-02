import type { Aabb } from './levelData.js';
import { PLAYER_HIT_CAPSULE_RADIUS } from '../combat/playerHitbox.js';

export interface SpawnXZ {
  readonly x: number;
  readonly z: number;
}

/** Named spawn zone — each label (B1, R3, …) covers a cluster of random sub-points. */
export interface SpawnZone {
  readonly x: number;
  readonly z: number;
  readonly spreadX: number;
  readonly spreadZ: number;
}

export interface SpawnPickContext {
  /** Positions already taken by other players this allocation pass. */
  occupied?: ReadonlyArray<SpawnXZ>;
  /** How many humans are on this team (sizes separation distance). */
  playersOnTeam?: number;
  /** Active team count for the match (2–4). */
  teamCount?: number;
  /** Optional map colliders for spawn-safe checks. */
  colliders?: ReadonlyArray<Aabb>;
  /** Minimum horizontal gap between two spawn points. */
  minSeparation?: number;
}

const DEFAULT_MIN_SEPARATION = 3.2;
const SPAWN_COLLISION_MARGIN = PLAYER_HIT_CAPSULE_RADIUS + 0.2;
const MAX_SPAWN_ATTEMPTS = 48;

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function randomPointInZone(zone: SpawnZone): SpawnXZ {
  return {
    x: zone.x + (Math.random() - 0.5) * zone.spreadX,
    z: zone.z + (Math.random() - 0.5) * zone.spreadZ,
  };
}

export function isSpawnBlocked(
  x: number,
  z: number,
  colliders: ReadonlyArray<Aabb> | undefined,
  margin = SPAWN_COLLISION_MARGIN,
): boolean {
  if (!colliders || colliders.length === 0) return false;

  for (const box of colliders) {
    if (box.maxY < 0.05) continue;
    if (box.minY > 2.2) continue;
    if (x + margin < box.minX || x - margin > box.maxX) continue;
    if (z + margin < box.minZ || z - margin > box.maxZ) continue;
    return true;
  }
  return false;
}

function isTooCloseToOccupied(
  x: number,
  z: number,
  occupied: ReadonlyArray<SpawnXZ>,
  minSeparation: number,
): boolean {
  const minSepSq = minSeparation * minSeparation;
  for (const point of occupied) {
    if (Math.abs(point.x) < 0.05 && Math.abs(point.z) < 0.05) continue;
    if (distSq(x, z, point.x, point.z) < minSepSq) {
      return true;
    }
  }
  return false;
}

function isSpawnClear(
  x: number,
  z: number,
  occupied: ReadonlyArray<SpawnXZ>,
  context: SpawnPickContext | undefined,
): boolean {
  const minSeparation = context?.minSeparation ?? DEFAULT_MIN_SEPARATION;
  if (isTooCloseToOccupied(x, z, occupied, minSeparation)) return false;
  if (isSpawnBlocked(x, z, context?.colliders)) return false;
  return true;
}

function tryRandomInZone(
  zone: SpawnZone,
  occupied: ReadonlyArray<SpawnXZ>,
  context: SpawnPickContext | undefined,
): SpawnXZ | null {
  for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
    const point = randomPointInZone(zone);
    if (isSpawnClear(point.x, point.z, occupied, context)) {
      return point;
    }
  }
  return null;
}

function activeZoneCount(pool: ReadonlyArray<SpawnZone>, playersOnTeam: number): number {
  if (playersOnTeam <= 1) return pool.length;
  return Math.min(pool.length, Math.max(playersOnTeam, 2));
}

function pickZonesForBatch(
  pool: ReadonlyArray<SpawnZone>,
  count: number,
): SpawnZone[] {
  if (count <= 0) return [];
  const shuffled = shuffle(pool);
  if (count >= pool.length) return shuffled;
  return shuffled.slice(0, count);
}

/** Assign unique, randomized spawn points for several players on the same team. */
export function pickBatchTeamSpawns(
  pool: ReadonlyArray<SpawnZone>,
  count: number,
  context: SpawnPickContext = {},
): SpawnXZ[] {
  if (count <= 0 || pool.length === 0) return [];

  const occupied = [...(context.occupied ?? [])];
  const results: SpawnXZ[] = [];
  const zones = pickZonesForBatch(pool, count);

  for (const zone of zones) {
    const point =
      tryRandomInZone(zone, occupied, context) ??
      tryRandomInZone(zone, occupied, { ...context, minSeparation: 1.6 }) ??
      randomPointInZone(zone);
    results.push(point);
    occupied.push(point);
  }

  return results;
}

/** Pick a single randomized team spawn — initial join or respawn. */
export function pickRandomTeamSpawn(
  pool: ReadonlyArray<SpawnZone>,
  context: SpawnPickContext = {},
): SpawnXZ {
  if (pool.length === 0) {
    return { x: 0, z: 0 };
  }

  const occupied = context.occupied ?? [];
  const playersOnTeam = Math.max(1, context.playersOnTeam ?? 1);
  const zoneBudget = activeZoneCount(pool, playersOnTeam);
  const zones = shuffle(pool).slice(0, zoneBudget);

  for (const zone of zones) {
    const point = tryRandomInZone(zone, occupied, context);
    if (point) return point;
  }

  for (const zone of pool) {
    const point = tryRandomInZone(zone, occupied, {
      ...context,
      minSeparation: 1.6,
    });
    if (point) return point;
  }

  const fallbackZone = pool[Math.floor(Math.random() * pool.length)]!;
  return randomPointInZone(fallbackZone);
}

/** Pick the team spawn farthest from where the player died; random tie-break. */
export function pickFarthestSpawn(
  spawns: ReadonlyArray<SpawnXZ>,
  deathX: number,
  deathZ: number,
): SpawnXZ {
  if (spawns.length === 0) {
    return { x: deathX, z: deathZ };
  }

  let maxDistSq = -1;
  const tied: SpawnXZ[] = [];

  for (const spawn of spawns) {
    const dSq = distSq(spawn.x, spawn.z, deathX, deathZ);
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      tied.length = 0;
      tied.push(spawn);
    } else if (dSq === maxDistSq) {
      tied.push(spawn);
    }
  }

  return tied[Math.floor(Math.random() * tied.length)] ?? spawns[0]!;
}

/**
 * Respawn: prefer zones far from the death location, random sub-point inside zone,
 * with separation from living players and geometry checks.
 */
export function pickRandomTeamRespawn(
  pool: ReadonlyArray<SpawnZone>,
  deathPosition: SpawnXZ,
  context: SpawnPickContext = {},
): SpawnXZ {
  if (pool.length === 0) {
    return { x: deathPosition.x, z: deathPosition.z };
  }

  const occupied = context.occupied ?? [];
  const zonesByDistance = [...pool].sort((a, b) => {
    const aDist = distSq(a.x, a.z, deathPosition.x, deathPosition.z);
    const bDist = distSq(b.x, b.z, deathPosition.x, deathPosition.z);
    return bDist - aDist;
  });

  // Weight toward farther zones but keep unpredictability.
  const candidateZones = shuffle([
    ...zonesByDistance.slice(0, Math.ceil(pool.length * 0.6)),
    ...shuffle(pool).slice(0, 2),
  ]);

  const seen = new Set<SpawnZone>();
  for (const zone of candidateZones) {
    if (seen.has(zone)) continue;
    seen.add(zone);
    const point = tryRandomInZone(zone, occupied, context);
    if (point) return point;
  }

  const farthestZone = pool.reduce((best, zone) => {
    const bestDist = distSq(best.x, best.z, deathPosition.x, deathPosition.z);
    const zoneDist = distSq(zone.x, zone.z, deathPosition.x, deathPosition.z);
    return zoneDist > bestDist ? zone : best;
  }, pool[0]!);
  return (
    tryRandomInZone(farthestZone, occupied, { ...context, minSeparation: 1.6 }) ??
    randomPointInZone(farthestZone)
  );
}
