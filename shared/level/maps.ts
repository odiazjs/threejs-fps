import type { Aabb } from './levelData.js';
import { AMMO_BOX_POSITIONS } from './ammoBoxSpawns.js';
import { SHIELD_CHARGE_POSITIONS } from './shieldChargeSpawns.js';
import {
  FLOOR_SIZE as KILO_FLOOR_SIZE,
  MAP_HALF as KILO_MAP_HALF,
  getLevelColliders as getKiloColliders,
  pickSpawnPoint as pickKiloSpawnPoint,
  pickTeamSpawnPoint as pickKiloTeamSpawnPoint,
  pickTeamRespawnPoint as pickKiloTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as KILO_RESPAWN_POINT,
} from './kiloSectorColliders.js';
import {
  FLOOR_SIZE as KILLHOUSE_FLOOR_SIZE,
  MAP_HALF as KILLHOUSE_MAP_HALF,
  MAP_HALF_X as KILLHOUSE_HALF_X,
  MAP_HALF_Z as KILLHOUSE_HALF_Z,
  getLevelColliders as getKillhouseColliders,
  pickSpawnPoint as pickKillhouseSpawnPoint,
  pickTeamSpawnPoint as pickKillhouseTeamSpawnPoint,
  pickTeamRespawnPoint as pickKillhouseTeamRespawnPoint,
  HUMAN_RESPAWN_POINT as KILLHOUSE_RESPAWN_POINT,
  sampleGroundHeight as killhouseGroundHeight,
  KILLHOUSE_AMMO_POSITIONS,
  KILLHOUSE_SHIELD_POSITIONS,
  KILLHOUSE_WALL_THICK,
} from './killhouseSmallColliders.js';
import { sampleGroundHeight as kiloGroundHeight } from './terrainHeight.js';

export type MapId = 'kilo_sector' | 'killhouse_small';

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
] as const;

export interface MapCollisionDef {
  id: MapId;
  label: string;
  floorSize: number;
  mapHalf: number;
  mapHalfX: number;
  mapHalfZ: number;
  wallThickness: number;
  outdoor: boolean;
  getLevelColliders: () => Aabb[];
  sampleGroundHeight: (x: number, z: number) => number;
  pickSpawnPoint: (playerIndex: number) => { x: number; z: number };
  pickTeamSpawnPoint?: (teamId: number, indexOnTeam: number) => { x: number; z: number };
  pickTeamRespawnPoint?: (
    teamId: number,
    deathPosition: { x: number; z: number },
  ) => { x: number; z: number };
  humanRespawnPoint: { x: number; z: number };
  ammoPositions: ReadonlyArray<{ x: number; z: number }>;
  shieldPositions: ReadonlyArray<{ x: number; z: number }>;
  spawnTrainingBots: boolean;
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
    getLevelColliders: getKillhouseColliders,
    sampleGroundHeight: killhouseGroundHeight,
    pickSpawnPoint: pickKillhouseSpawnPoint,
    pickTeamSpawnPoint: pickKillhouseTeamSpawnPoint,
    pickTeamRespawnPoint: pickKillhouseTeamRespawnPoint,
    humanRespawnPoint: KILLHOUSE_RESPAWN_POINT,
    ammoPositions: KILLHOUSE_AMMO_POSITIONS,
    shieldPositions: KILLHOUSE_SHIELD_POSITIONS,
    spawnTrainingBots: false,
  },
};

export function isValidMapId(value: string | null | undefined): value is MapId {
  return value === 'kilo_sector' || value === 'killhouse_small';
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
