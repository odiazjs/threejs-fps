import type { Aabb } from './levelData.js';
import type { SpawnPickContext, SpawnZone } from './spawnPick.js';
import {
  pickBatchTeamSpawns,
  pickRandomTeamRespawn,
  pickRandomTeamSpawn,
} from './spawnPick.js';

/** Chrono-Bowl 2v2 arena — compact rectangular killhouse. */
export const KILLHOUSE_WIDTH = 50;
export const KILLHOUSE_DEPTH = 32;
export const MAP_HALF_X = KILLHOUSE_WIDTH / 2;
export const MAP_HALF_Z = KILLHOUSE_DEPTH / 2;
export const KILLHOUSE_WALL_THICK = 0.45;
export const KILLHOUSE_WALL_HEIGHT = 3.2;

/** Largest extent — used for fog / coarse bounds until rectangular maps are wired everywhere. */
export const FLOOR_SIZE = Math.max(KILLHOUSE_WIDTH, KILLHOUSE_DEPTH);
export const MAP_HALF = FLOOR_SIZE / 2;

const MAP_INSET = 3;

export interface BoxProp {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rotY?: number;
  minY?: number;
}

export interface PlatformDef {
  x: number;
  z: number;
  w: number;
  d: number;
  surfaceY: number;
  thickness?: number;
}

export const PERIMETER_WALLS: readonly BoxProp[] = [
  {
    x: 0,
    z: -MAP_HALF_Z + KILLHOUSE_WALL_THICK / 2,
    w: KILLHOUSE_WIDTH,
    h: KILLHOUSE_WALL_HEIGHT,
    d: KILLHOUSE_WALL_THICK,
  },
  {
    x: 0,
    z: MAP_HALF_Z - KILLHOUSE_WALL_THICK / 2,
    w: KILLHOUSE_WIDTH,
    h: KILLHOUSE_WALL_HEIGHT,
    d: KILLHOUSE_WALL_THICK,
  },
  {
    x: -MAP_HALF_X + KILLHOUSE_WALL_THICK / 2,
    z: 0,
    w: KILLHOUSE_WALL_THICK,
    h: KILLHOUSE_WALL_HEIGHT,
    d: KILLHOUSE_DEPTH,
  },
  {
    x: MAP_HALF_X - KILLHOUSE_WALL_THICK / 2,
    z: 0,
    w: KILLHOUSE_WALL_THICK,
    h: KILLHOUSE_WALL_HEIGHT,
    d: KILLHOUSE_DEPTH,
  },
] as const;

export const CONTAINERS: readonly BoxProp[] = [
  { x: 1.5, z: 1, w: 2.4, h: 2.6, d: 6.2, rotY: Math.PI / 4 },
  { x: -5, z: -5.5, w: 2.4, h: 2.6, d: 6.2 },
  { x: 9, z: -7, w: 2.4, h: 2.6, d: 6.2, rotY: 0.22 },
  { x: -1, z: 9.5, w: 2.4, h: 2.6, d: 6.2, rotY: -0.12 },
] as const;

export const COVER_WALLS: readonly BoxProp[] = [
  { x: -8, z: -2, w: 3.6, h: 1.8, d: 0.35 },
  { x: 6, z: 4.5, w: 0.35, h: 1.8, d: 3.2 },
  { x: -2, z: -9, w: 4.2, h: 1.4, d: 0.35 },
  { x: 12, z: 7, w: 2.8, h: 1.4, d: 0.35, rotY: Math.PI / 2 },
] as const;

export const ENERGY_BARRIERS: readonly BoxProp[] = [
  { x: -3, z: 3, w: 2.8, h: 1.25, d: 0.08 },
  { x: 4, z: -2, w: 0.08, h: 1.25, d: 2.6 },
  { x: -11, z: -8, w: 2.2, h: 1.25, d: 0.08 },
  { x: 16, z: 2, w: 0.08, h: 1.25, d: 2.4 },
] as const;

export const CRATE_STACKS: readonly BoxProp[] = [
  { x: -20, z: -10, w: 0.9, h: 0.9, d: 0.9 },
  { x: -19.1, z: -10, w: 0.9, h: 0.9, d: 0.9 },
  { x: 18, z: 10, w: 0.85, h: 0.85, d: 0.85 },
  { x: 18.9, z: 10, w: 0.85, h: 0.85, d: 0.85 },
  { x: 18.45, z: 10.9, w: 0.85, h: 0.85, d: 0.85 },
  { x: -14, z: 12, w: 0.8, h: 0.8, d: 0.8 },
  { x: 8, z: 11, w: 0.8, h: 0.8, d: 0.8 },
] as const;

/** Elevated lab platforms + mid-landing decks. */
export const PLATFORMS: readonly PlatformDef[] = [
  { x: -16, z: 4, w: 9, d: 7, surfaceY: 3.2 },
  { x: 14, z: -1, w: 7.5, d: 9, surfaceY: 3.2 },
  { x: -16, z: 4, w: 3.5, d: 2.2, surfaceY: 1.55, thickness: 0.28 },
  { x: 14, z: -1, w: 3.5, d: 2.2, surfaceY: 1.55, thickness: 0.28 },
] as const;

/** Ground-floor lab shell walls. */
export const LAB_SHELLS: readonly BoxProp[] = [
  { x: -16, z: 4, w: 10, h: 2.8, d: 0.35 },
  { x: -21.2, z: 4, w: 0.35, h: 2.8, d: 8.2 },
  { x: -16, z: 8.35, w: 10, h: 2.8, d: 0.35 },
  { x: -10.8, z: 4, w: 0.35, h: 2.8, d: 8.2 },
  { x: 14, z: -1, w: 8.5, h: 2.8, d: 0.35 },
  { x: 18.6, z: -1, w: 0.35, h: 2.8, d: 10.2 },
  { x: 14, z: 4.35, w: 8.5, h: 2.8, d: 0.35 },
  { x: 9.4, z: -1, w: 0.35, h: 2.8, d: 10.2 },
] as const;

function buildStairs(originX: number, originZ: number, stairOffsetX: number): BoxProp[] {
  const stairs: BoxProp[] = [];
  const stairX = originX + stairOffsetX;
  for (let step = 0; step < 6; step++) {
    stairs.push({
      x: stairX,
      z: originZ - 2.4 + step * 0.55,
      w: 1.4,
      h: (step + 1) * 0.24,
      d: 0.7,
    });
  }
  return stairs;
}

export const STAIRS: readonly BoxProp[] = [
  ...buildStairs(-16, 4, -3.8),
  ...buildStairs(14, -1, 3.8),
] as const;

export const ROVERS: readonly BoxProp[] = [
  { x: -8, z: -11, w: 1.6, h: 1.1, d: 2.4, rotY: 0.4 },
  { x: 5, z: 8, w: 1.6, h: 1.1, d: 2.4, rotY: -0.8 },
  { x: 17, z: -9, w: 1.6, h: 1.1, d: 2.4, rotY: 1.2 },
] as const;

export const VIEWPORT_WALLS: readonly BoxProp[] = [
  { x: 0, z: MAP_HALF_Z - KILLHOUSE_WALL_THICK - 0.2, w: 12, h: 2.6, d: 0.35 },
  { x: -6.2, z: MAP_HALF_Z - KILLHOUSE_WALL_THICK - 0.2, w: 0.35, h: 3.4, d: 0.35 },
  { x: 6.2, z: MAP_HALF_Z - KILLHOUSE_WALL_THICK - 0.2, w: 0.35, h: 3.4, d: 0.35 },
  { x: 0, z: MAP_HALF_Z - KILLHOUSE_WALL_THICK - 0.2, w: 12.8, h: 0.35, d: 0.35, minY: 3.35 },
] as const;

export const PLATFORM_RAILS: readonly BoxProp[] = [
  { x: -16, z: 0.7, w: 9, h: 1.05, d: 0.08, minY: 3.2 },
  { x: -20.3, z: 4, w: 0.08, h: 1.05, d: 7, minY: 3.2 },
  { x: -11.7, z: 4, w: 0.08, h: 1.05, d: 7, minY: 3.2 },
  { x: 14, z: -4.3, w: 7.5, h: 1.05, d: 0.08, minY: 3.2 },
  { x: 10.55, z: -1, w: 0.08, h: 1.05, d: 9, minY: 3.2 },
  { x: 17.45, z: -1, w: 0.08, h: 1.05, d: 9, minY: 3.2 },
] as const;

export const LAB_PROPS: readonly BoxProp[] = [
  { x: -16, z: 4, w: 1.1, h: 1.6, d: 1.1 },
  { x: 14, z: -1, w: 1.1, h: 1.6, d: 1.1 },
  { x: -17.2, z: 5.2, w: 1.2, h: 0.9, d: 0.5, minY: 3.2 },
  { x: 12.8, z: 0.2, w: 1.2, h: 0.9, d: 0.5, minY: 3.2 },
] as const;

/** Chrono-Bowl spawn pools — B1–B6 (west) and R1–R6 (east) per arena layout. */
const BLUE_SPAWN_POOL: readonly SpawnZone[] = [
  { x: -22.5, z: -12.5, spreadX: 2.4, spreadZ: 2.2 }, // B1 top-left corner
  { x: -12.5, z: -0.5, spreadX: 2.8, spreadZ: 2.6 }, // B2 mid-left lane
  { x: -20.8, z: 3.8, spreadX: 2.2, spreadZ: 3.0 }, // B3 west lab corridor
  { x: -17.2, z: 7.2, spreadX: 2.6, spreadZ: 2.4 }, // B4 lab interior / stairs
  { x: -20.5, z: 12.8, spreadX: 2.8, spreadZ: 2.2 }, // B5 bottom-left exterior
  { x: -2.5, z: 1.2, spreadX: 2.6, spreadZ: 2.8 }, // B6 center-left behind container
];

const RED_SPAWN_POOL: readonly SpawnZone[] = [
  { x: 22.5, z: 12.5, spreadX: 2.4, spreadZ: 2.2 }, // R1 top-right corner
  { x: 12.5, z: 0.5, spreadX: 2.8, spreadZ: 2.6 }, // R2 mid-right lane
  { x: 17.5, z: 9.8, spreadX: 2.8, spreadZ: 2.6 }, // R3 center-right crate stack
  { x: 17.2, z: -2.8, spreadX: 2.6, spreadZ: 3.0 }, // R4 east lab interior
  { x: 3.5, z: 1.0, spreadX: 2.6, spreadZ: 2.8 }, // R5 center-top container lane
  { x: 20.5, z: -12.8, spreadX: 2.8, spreadZ: 2.2 }, // R6 bottom-right exterior
];

/** Extra pools for 3–4 team layouts on the same map. */
const GREEN_SPAWN_POOL: readonly SpawnZone[] = [
  { x: -18.5, z: 13.5, spreadX: 2.6, spreadZ: 2.4 },
  { x: -14.0, z: 14.2, spreadX: 2.4, spreadZ: 2.2 },
  { x: -22.0, z: 10.5, spreadX: 2.2, spreadZ: 2.6 },
  { x: -11.5, z: 11.8, spreadX: 2.8, spreadZ: 2.4 },
  { x: -20.0, z: 14.5, spreadX: 2.4, spreadZ: 2.0 },
  { x: -15.5, z: 8.5, spreadX: 2.6, spreadZ: 2.4 },
];

const PURPLE_SPAWN_POOL: readonly SpawnZone[] = [
  { x: 18.5, z: -13.5, spreadX: 2.6, spreadZ: 2.4 },
  { x: 14.0, z: -14.2, spreadX: 2.4, spreadZ: 2.2 },
  { x: 22.0, z: -10.5, spreadX: 2.2, spreadZ: 2.6 },
  { x: 11.5, z: -11.8, spreadX: 2.8, spreadZ: 2.4 },
  { x: 20.0, z: -14.5, spreadX: 2.4, spreadZ: 2.0 },
  { x: 15.5, z: -8.5, spreadX: 2.6, spreadZ: 2.4 },
];

const TEAM_SPAWN_POOLS: ReadonlyArray<ReadonlyArray<SpawnZone>> = [
  BLUE_SPAWN_POOL,
  RED_SPAWN_POOL,
  GREEN_SPAWN_POOL,
  PURPLE_SPAWN_POOL,
];

const FFA_SPAWN_POOL: readonly SpawnZone[] = [
  ...BLUE_SPAWN_POOL,
  ...RED_SPAWN_POOL,
];

export const HUMAN_RESPAWN_POINT = { x: -19, z: -12 } as const;

function teamPool(teamId: number): readonly SpawnZone[] {
  return TEAM_SPAWN_POOLS[teamId % TEAM_SPAWN_POOLS.length] ?? BLUE_SPAWN_POOL;
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

export function pickSpawnPoint(
  playerIndex: number,
  context: SpawnPickContext = {},
): { x: number; z: number } {
  void playerIndex;
  return pickRandomTeamSpawn(FFA_SPAWN_POOL, context);
}

export function sampleGroundHeight(_x: number, _z: number): number {
  return 0;
}

function rotatedHalfExtents(w: number, d: number, rotY: number): { halfX: number; halfZ: number } {
  const c = Math.abs(Math.cos(rotY));
  const s = Math.abs(Math.sin(rotY));
  return {
    halfX: c * (w / 2) + s * (d / 2),
    halfZ: s * (w / 2) + c * (d / 2),
  };
}

function boxAabb(prop: BoxProp, platform = false): Aabb {
  const rotY = prop.rotY ?? 0;
  const { halfX, halfZ } = rotatedHalfExtents(prop.w, prop.d, rotY);
  const minY = prop.minY ?? 0;
  return {
    minX: prop.x - halfX,
    maxX: prop.x + halfX,
    minY,
    maxY: minY + prop.h,
    minZ: prop.z - halfZ,
    maxZ: prop.z + halfZ,
    ...(platform ? { platform: true as const } : {}),
  };
}

function platformAabb(def: PlatformDef): Aabb {
  const thickness = def.thickness ?? 0.32;
  return {
    minX: def.x - def.w / 2,
    maxX: def.x + def.w / 2,
    minY: def.surfaceY - thickness,
    maxY: def.surfaceY,
    minZ: def.z - def.d / 2,
    maxZ: def.z + def.d / 2,
    platform: true,
  };
}

function propsToAabbs(props: readonly BoxProp[]): Aabb[] {
  return props.map((prop) => boxAabb(prop));
}

function buildColliderList(): Aabb[] {
  return [
    ...propsToAabbs(PERIMETER_WALLS),
    ...propsToAabbs(CONTAINERS),
    ...propsToAabbs(COVER_WALLS),
    ...propsToAabbs(ENERGY_BARRIERS),
    ...propsToAabbs(CRATE_STACKS),
    ...propsToAabbs(LAB_SHELLS),
    ...propsToAabbs(STAIRS),
    ...propsToAabbs(ROVERS),
    ...propsToAabbs(VIEWPORT_WALLS),
    ...propsToAabbs(PLATFORM_RAILS),
    ...propsToAabbs(LAB_PROPS),
    ...PLATFORMS.map(platformAabb),
  ];
}

let cachedColliders: Aabb[] | null = null;

export function getLevelColliders(): Aabb[] {
  cachedColliders ??= buildColliderList();
  return cachedColliders;
}

export function isInsideKillhouseBounds(x: number, z: number, padding = MAP_INSET): boolean {
  const limitX = MAP_HALF_X - padding;
  const limitZ = MAP_HALF_Z - padding;
  return Math.abs(x) <= limitX && Math.abs(z) <= limitZ;
}

export const KILLHOUSE_AMMO_POSITIONS = [
  { x: 0, z: 0 },
  { x: -14, z: -8 },
  { x: 14, z: 6 },
  { x: -6, z: 10 },
] as const;

export const KILLHOUSE_SHIELD_POSITIONS = [
  { x: 10, z: -8 },
  { x: -12, z: 4 },
] as const;
