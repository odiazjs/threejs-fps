import type { Aabb } from './levelData.js';
import type { SpawnPickContext } from './spawnPick.js';
import { AMMO_BOX_POSITIONS } from './ammoBoxSpawns.js';
import { SHIELD_CHARGE_POSITIONS } from './shieldChargeSpawns.js';
import {
  FLOOR_SIZE as KILO_FLOOR_SIZE,
  MAP_HALF as KILO_MAP_HALF,
  getLevelColliders as getKiloColliders,
  pickSpawnPoint as pickKiloSpawnPoint,
  pickTeamSpawnPoint as pickKiloTeamSpawnPoint,
  pickTeamSpawnBatch as pickKiloTeamSpawnBatch,
  pickTeamRespawnPoint as pickKiloTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as KILO_RESPAWN_POINT,
} from './kiloSectorColliders.js';
import {
  FLOOR_SIZE as KILLHOUSE_FLOOR_SIZE,
  MAP_HALF as KILLHOUSE_MAP_HALF,
  MAP_HALF_X as KILLHOUSE_HALF_X,
  MAP_HALF_Z as KILLHOUSE_HALF_Z,
  pickSpawnPoint as pickKillhouseSpawnPoint,
  pickTeamSpawnPoint as pickKillhouseTeamSpawnPoint,
  pickTeamSpawnBatch as pickKillhouseTeamSpawnBatch,
  pickTeamRespawnPoint as pickKillhouseTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as KILLHOUSE_RESPAWN_POINT,
  sampleGroundHeight as killhouseGroundHeight,
  KILLHOUSE_AMMO_POSITIONS,
  KILLHOUSE_SHIELD_POSITIONS,
  KILLHOUSE_WALL_THICK,
} from './killhouseSmallColliders.js';
import {
  FLOOR_SIZE as FIRING_RANGE_FLOOR_SIZE,
  MAP_HALF as FIRING_RANGE_MAP_HALF,
  MAP_HALF_X as FIRING_RANGE_HALF_X,
  MAP_HALF_Z as FIRING_RANGE_HALF_Z,
  pickSpawnPoint as pickFiringRangeSpawnPoint,
  pickTeamSpawnPoint as pickFiringRangeTeamSpawnPoint,
  pickTeamSpawnBatch as pickFiringRangeTeamSpawnBatch,
  pickTeamRespawnPoint as pickFiringRangeTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as FIRING_RANGE_RESPAWN_POINT,
  sampleGroundHeight as firingRangeGroundHeight,
} from './firingRangeColliders.js';
import {
  getFiringRangeAmmoPositions,
  getFiringRangeShieldPositions,
  getFiringRangeWeaponSpawns,
  type FiringRangeWeaponSpawn,
} from './firingRangePickups.js';
import { sampleGroundHeight as kiloGroundHeight } from './terrainHeight.js';
import { getMapPhysics } from './mapMeshMovement.js';

export type MapId = 'kilo_sector' | 'killhouse_small' | 'firing_range';

export const DEFAULT_MAP_ID: MapId = 'kilo_sector';

export interface MapOption {
  id: MapId;
  label: string;
  description: string;
}

export const MAP_OPTIONS: readonly MapOption[] = [
  {
    id: 'kilo_sector',
    label: 'Kilo Sector',
    description: 'Large outdoor arena',
  },
  {
    id: 'killhouse_small',
    label: 'Chrono-Bowl',
    description: 'Compact 2v2 killhouse',
  },
  {
    id: 'firing_range',
    label: 'Firing Range',
    description: 'Sandbox range — editor map (firing_range_map.glb)',
  },
] as const;

export type { FiringRangeWeaponSpawn as MapWeaponSpawn };

export interface MapCollisionDef {
  id: MapId;
  label: string;
  floorSize: number;
  mapHalf: number;
  mapHalfX: number;
  mapHalfZ: number;
  wallThickness: number;
  outdoor: boolean;
  /** True when movement uses baked/runtime mesh BVH instead of module AABBs. */
  usesMeshCollision?: boolean;
  getLevelColliders: () => Aabb[];
  /** Client-only box fallback before mesh BVH is ready. */
  getClientGameplayColliders?: () => Aabb[];
  sampleGroundHeight: (x: number, z: number) => number;
  pickSpawnPoint: (playerIndex: number, context?: SpawnPickContext) => { x: number; z: number };
  pickTeamSpawnPoint?: (
    teamId: number,
    indexOnTeam: number,
    context?: SpawnPickContext,
  ) => { x: number; z: number };
  pickTeamSpawnBatch?: (
    teamId: number,
    count: number,
    context?: SpawnPickContext,
  ) => Array<{ x: number; z: number }>;
  pickTeamRespawnPoint?: (
    teamId: number,
    deathPosition: { x: number; z: number },
    context?: SpawnPickContext,
  ) => { x: number; z: number };
  humanRespawnPoint: { x: number; z: number };
  ammoPositions: ReadonlyArray<{ x: number; z: number }>;
  shieldPositions: ReadonlyArray<{ x: number; z: number }>;
  /** When set, overrides `ammoPositions` (e.g. GLB crate anchors loaded at runtime). */
  getAmmoPositions?: () => ReadonlyArray<{ x: number; z: number }>;
  getShieldPositions?: () => ReadonlyArray<{ x: number; z: number }>;
  getInitialWeaponSpawns?: () => ReadonlyArray<FiringRangeWeaponSpawn>;
  spawnTrainingBots: boolean;
  /** Join and respawn with no weapons — players must pick them up. */
  emptyStartingLoadout?: boolean;
}

const MAPS: Record<MapId, MapCollisionDef> = {
  kilo_sector: {
    id: 'kilo_sector',
    label: 'Kilo Sector',
    floorSize: KILO_FLOOR_SIZE,
    mapHalf: KILO_MAP_HALF,
    mapHalfX: KILO_MAP_HALF,
    mapHalfZ: KILO_MAP_HALF,
    wallThickness: 0,
    outdoor: true,
    getLevelColliders: getKiloColliders,
    sampleGroundHeight: kiloGroundHeight,
    pickSpawnPoint: pickKiloSpawnPoint,
    pickTeamSpawnPoint: pickKiloTeamSpawnPoint,
    pickTeamSpawnBatch: pickKiloTeamSpawnBatch,
    pickTeamRespawnPoint: pickKiloTeamRespawnPoint,
    humanRespawnPoint: KILO_RESPAWN_POINT,
    ammoPositions: AMMO_BOX_POSITIONS,
    shieldPositions: SHIELD_CHARGE_POSITIONS,
    spawnTrainingBots: true,
  },
  killhouse_small: {
    id: 'killhouse_small',
    label: 'Chrono-Bowl',
    floorSize: KILLHOUSE_FLOOR_SIZE,
    mapHalf: KILLHOUSE_MAP_HALF,
    mapHalfX: KILLHOUSE_HALF_X,
    mapHalfZ: KILLHOUSE_HALF_Z,
    wallThickness: KILLHOUSE_WALL_THICK,
    outdoor: false,
    usesMeshCollision: true,
    getLevelColliders: () => [],
    getClientGameplayColliders: () => [],
    sampleGroundHeight: killhouseGroundHeight,
    pickSpawnPoint: pickKillhouseSpawnPoint,
    pickTeamSpawnPoint: pickKillhouseTeamSpawnPoint,
    pickTeamSpawnBatch: pickKillhouseTeamSpawnBatch,
    pickTeamRespawnPoint: pickKillhouseTeamRespawnPoint,
    humanRespawnPoint: KILLHOUSE_RESPAWN_POINT,
    ammoPositions: KILLHOUSE_AMMO_POSITIONS,
    shieldPositions: KILLHOUSE_SHIELD_POSITIONS,
    spawnTrainingBots: false,
  },
  firing_range: {
    id: 'firing_range',
    label: 'Firing Range',
    floorSize: FIRING_RANGE_FLOOR_SIZE,
    mapHalf: FIRING_RANGE_MAP_HALF,
    mapHalfX: FIRING_RANGE_HALF_X,
    mapHalfZ: FIRING_RANGE_HALF_Z,
    wallThickness: 0,
    outdoor: false,
    usesMeshCollision: true,
    getLevelColliders: () => [],
    getClientGameplayColliders: () => [],
    sampleGroundHeight: firingRangeGroundHeight,
    pickSpawnPoint: pickFiringRangeSpawnPoint,
    pickTeamSpawnPoint: pickFiringRangeTeamSpawnPoint,
    pickTeamSpawnBatch: pickFiringRangeTeamSpawnBatch,
    pickTeamRespawnPoint: pickFiringRangeTeamRespawnPoint,
    humanRespawnPoint: FIRING_RANGE_RESPAWN_POINT,
    ammoPositions: [],
    shieldPositions: [],
    getAmmoPositions: getFiringRangeAmmoPositions,
    getShieldPositions: getFiringRangeShieldPositions,
    getInitialWeaponSpawns: getFiringRangeWeaponSpawns,
    spawnTrainingBots: false,
    emptyStartingLoadout: true,
  },
};

export function isValidMapId(value: string | null | undefined): value is MapId {
  return value === 'kilo_sector' || value === 'killhouse_small' || value === 'firing_range';
}

export function normalizeMapId(value: string | null | undefined): MapId {
  return isValidMapId(value) ? value : DEFAULT_MAP_ID;
}

export function getMapDef(mapId: MapId): MapCollisionDef {
  return MAPS[mapId];
}

let clientMapDef: MapCollisionDef = MAPS[DEFAULT_MAP_ID];

export function setClientMapDef(mapId: MapId): void {
  clientMapDef = getMapDef(mapId);
}

export function getClientMapDef(): MapCollisionDef {
  return clientMapDef;
}

/** Box colliders used before Rapier physics is ready. Empty on trimesh maps once physics loads. */
export function getClientGameplayColliders(map: MapCollisionDef = getClientMapDef()): Aabb[] {
  if (map.usesMeshCollision && getMapPhysics()?.isReady) {
    return map.getClientGameplayColliders?.() ?? [];
  }
  return map.getClientGameplayColliders?.() ?? map.getLevelColliders();
}
