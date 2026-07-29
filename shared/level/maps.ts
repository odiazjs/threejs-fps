import type { Aabb } from './levelData.js';
import type { SpawnPickContext } from './spawnPick.js';
import {
  FLOOR_SIZE as TDM_MAP_FLOOR_SIZE,
  MAP_HALF as TDM_MAP_HALF,
  MAP_HALF_X as TDM_MAP_HALF_X,
  MAP_HALF_Z as TDM_MAP_HALF_Z,
  pickSpawnPoint as pickTdmMapSpawnPoint,
  pickTeamSpawnPoint as pickTdmMapTeamSpawnPoint,
  pickTeamSpawnBatch as pickTdmMapTeamSpawnBatch,
  pickTeamRespawnPoint as pickTdmMapTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as TDM_MAP_RESPAWN_POINT,
  sampleGroundHeight as tdmMapGroundHeight,
  TDM_MAP_AMMO_POSITIONS,
  TDM_MAP_SHIELD_POSITIONS,
  TDM_MAP_GRENADE_POSITIONS,
} from './tdmMapColliders.js';
import { TDM_MAP_WALL_THICK } from './tdmMapConfig.js';
import {
  FLOOR_SIZE as HARVEST_MAP_FLOOR_SIZE,
  MAP_HALF as HARVEST_MAP_HALF,
  MAP_HALF_X as HARVEST_MAP_HALF_X,
  MAP_HALF_Z as HARVEST_MAP_HALF_Z,
  pickSpawnPoint as pickHarvestMapSpawnPoint,
  pickTeamSpawnPoint as pickHarvestMapTeamSpawnPoint,
  pickTeamSpawnBatch as pickHarvestMapTeamSpawnBatch,
  pickTeamRespawnPoint as pickHarvestMapTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as HARVEST_MAP_RESPAWN_POINT,
  sampleGroundHeight as harvestMapGroundHeight,
  HARVEST_MAP_AMMO_POSITIONS,
  HARVEST_MAP_SHIELD_POSITIONS,
  HARVEST_MAP_GRENADE_POSITIONS,
} from './harvestMapColliders.js';
import { HARVEST_MAP_WALL_THICK } from './harvestMapConfig.js';
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
  getFiringRangeGrenadePositions,
  getFiringRangeShieldPositions,
  getFiringRangeWeaponSpawns,
  type FiringRangeWeaponSpawn,
} from './firingRangePickups.js';
import { getMapPhysics } from './mapMeshMovement.js';

export type MapId = 'firing_range' | 'killhouse_small' | 'harvest';

export const DEFAULT_MAP_ID: MapId = 'firing_range';

export interface MapOption {
  id: MapId;
  label: string;
  description: string;
}

export const MAP_OPTIONS: readonly MapOption[] = [
  {
    id: 'firing_range',
    label: 'Firing Range',
    description: 'Sandbox range — editor map (firing_range_map.glb)',
  },
  {
    id: 'killhouse_small',
    label: 'Chrono-Bowl',
    description: 'Compact 2v2 TDM arena (tdm_map.glb)',
  },
  {
    id: 'harvest',
    label: 'Harvest',
    description: 'Plasma Harvest arena (harvest_map.glb)',
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
  getGrenadePositions?: () => ReadonlyArray<{ x: number; z: number }>;
  /** Overrides the global grenade pickup respawn delay (seconds) for this map. */
  grenadePickupRespawnSec?: number;
  /** Grenades granted per world pickup stack on this map (default 4). */
  grenadePickupGrant?: number;
  /** When set, a player's grenade count is reset to this on death-respawn. */
  respawnGrenadeCount?: number;
  getInitialWeaponSpawns?: () => ReadonlyArray<FiringRangeWeaponSpawn>;
  spawnTrainingBots: boolean;
  /** Join and respawn with no weapons — players must pick them up. */
  emptyStartingLoadout?: boolean;
}

const MAPS: Record<MapId, MapCollisionDef> = {
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
    getGrenadePositions: getFiringRangeGrenadePositions,
    getInitialWeaponSpawns: getFiringRangeWeaponSpawns,
    spawnTrainingBots: false,
    emptyStartingLoadout: true,
  },
  killhouse_small: {
    id: 'killhouse_small',
    label: 'Chrono-Bowl',
    floorSize: TDM_MAP_FLOOR_SIZE,
    mapHalf: TDM_MAP_HALF,
    mapHalfX: TDM_MAP_HALF_X,
    mapHalfZ: TDM_MAP_HALF_Z,
    wallThickness: TDM_MAP_WALL_THICK,
    outdoor: false,
    usesMeshCollision: true,
    getLevelColliders: () => [],
    getClientGameplayColliders: () => [],
    sampleGroundHeight: tdmMapGroundHeight,
    pickSpawnPoint: pickTdmMapSpawnPoint,
    pickTeamSpawnPoint: pickTdmMapTeamSpawnPoint,
    pickTeamSpawnBatch: pickTdmMapTeamSpawnBatch,
    pickTeamRespawnPoint: pickTdmMapTeamRespawnPoint,
    humanRespawnPoint: TDM_MAP_RESPAWN_POINT,
    ammoPositions: TDM_MAP_AMMO_POSITIONS,
    shieldPositions: TDM_MAP_SHIELD_POSITIONS,
    getGrenadePositions: () => TDM_MAP_GRENADE_POSITIONS,
    grenadePickupRespawnSec: 10,
    grenadePickupGrant: 1,
    respawnGrenadeCount: 1,
    spawnTrainingBots: false,
  },
  harvest: {
    id: 'harvest',
    label: 'Harvest',
    floorSize: HARVEST_MAP_FLOOR_SIZE,
    mapHalf: HARVEST_MAP_HALF,
    mapHalfX: HARVEST_MAP_HALF_X,
    mapHalfZ: HARVEST_MAP_HALF_Z,
    wallThickness: HARVEST_MAP_WALL_THICK,
    outdoor: false,
    usesMeshCollision: true,
    getLevelColliders: () => [],
    getClientGameplayColliders: () => [],
    sampleGroundHeight: harvestMapGroundHeight,
    pickSpawnPoint: pickHarvestMapSpawnPoint,
    pickTeamSpawnPoint: pickHarvestMapTeamSpawnPoint,
    pickTeamSpawnBatch: pickHarvestMapTeamSpawnBatch,
    pickTeamRespawnPoint: pickHarvestMapTeamRespawnPoint,
    humanRespawnPoint: HARVEST_MAP_RESPAWN_POINT,
    ammoPositions: HARVEST_MAP_AMMO_POSITIONS,
    shieldPositions: HARVEST_MAP_SHIELD_POSITIONS,
    getGrenadePositions: () => HARVEST_MAP_GRENADE_POSITIONS,
    grenadePickupRespawnSec: 10,
    grenadePickupGrant: 1,
    /** Plasma Harvest starts / respawns with no throwable / shield charges. */
    respawnGrenadeCount: 0,
    spawnTrainingBots: false,
  },
};

export function isValidMapId(value: string | null | undefined): value is MapId {
  return (
    value === 'firing_range' ||
    value === 'killhouse_small' ||
    value === 'harvest'
  );
}

export function normalizeMapId(value: string | null | undefined): MapId {
  return isValidMapId(value) ? value : DEFAULT_MAP_ID;
}

export function mapHasMinimap(mapId: MapId): boolean {
  return (
    mapId === 'firing_range' ||
    mapId === 'killhouse_small' ||
    mapId === 'harvest'
  );
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
