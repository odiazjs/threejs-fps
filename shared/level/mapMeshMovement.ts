import { CROUCH_EYE_HEIGHT } from '../combat/crouch.js';
import { EYE_HEIGHT } from './levelData.js';
import {
  clampEyeY,
  movePlayer,
  resolveMoveFeetY,
  stepPlayerPhysics,
  type PlayerPhysicsState,
} from './collision.js';
import type { MapCollisionDef } from './maps.js';
import { MergedMeshBvhCollision } from './mergedMeshBvhCollision.js';
import { parseLevelCollisionBake } from './levelMeshCollisionUtils.js';

let killhouseMeshCollision: MergedMeshBvhCollision | null = null;

export function initKillhouseMeshCollisionFromBuffer(buffer: ArrayBuffer): MergedMeshBvhCollision {
  const collision = new MergedMeshBvhCollision();
  collision.loadFromBake(parseLevelCollisionBake(buffer));
  killhouseMeshCollision = collision;
  return collision;
}

export function getKillhouseMeshCollision(): MergedMeshBvhCollision | null {
  return killhouseMeshCollision;
}

export function usesKillhouseMeshCollision(map: MapCollisionDef): boolean {
  return map.id === 'killhouse_small';
}

function meshForMap(map: MapCollisionDef): MergedMeshBvhCollision | null {
  if (!usesKillhouseMeshCollision(map)) return null;
  return killhouseMeshCollision;
}

export function movePlayerForMap(
  feetX: number,
  feetY: number,
  feetZ: number,
  deltaX: number,
  deltaZ: number,
  map: MapCollisionDef,
): { x: number; y: number; z: number } {
  const mesh = meshForMap(map);
  if (mesh?.isReady) {
    return mesh.movePlayer(feetX, feetY, feetZ, deltaX, deltaZ, map);
  }
  return movePlayer(feetX, feetY, feetZ, deltaX, deltaZ, map);
}

export function stepPlayerPhysicsForMap(
  feetX: number,
  feetY: number,
  feetZ: number,
  state: PlayerPhysicsState,
  deltaX: number,
  deltaZ: number,
  jump: boolean,
  delta: number,
  map: MapCollisionDef,
): { x: number; y: number; z: number; state: PlayerPhysicsState } {
  const mesh = meshForMap(map);
  if (mesh?.isReady) {
    return mesh.stepPlayerPhysics(feetX, feetY, feetZ, state, deltaX, deltaZ, jump, delta, map);
  }
  return stepPlayerPhysics(feetX, feetY, feetZ, state, deltaX, deltaZ, jump, delta, map);
}

export function clampEyeYForMap(
  feetX: number,
  feetZ: number,
  eyeY: number,
  map: MapCollisionDef,
  crouching = false,
): number {
  const mesh = meshForMap(map);
  if (mesh?.isReady) {
    return mesh.clampEyeY(
      feetX,
      feetZ,
      eyeY,
      map,
      crouching,
      EYE_HEIGHT,
      CROUCH_EYE_HEIGHT,
    );
  }
  return clampEyeY(feetX, feetZ, eyeY, map, crouching);
}

export function resolveMoveFeetYForMap(
  feetX: number,
  feetZ: number,
  clientFeetY: number,
  map: MapCollisionDef,
): number {
  const mesh = meshForMap(map);
  if (mesh?.isReady) {
    return mesh.resolveMoveFeetY(feetX, feetZ, clientFeetY, map);
  }
  return resolveMoveFeetY(feetX, feetZ, clientFeetY, map);
}

export function getSpawnCollidersForMap(map: MapCollisionDef) {
  if (usesKillhouseMeshCollision(map) && killhouseMeshCollision?.isReady) {
    return [];
  }
  return map.getLevelColliders();
}

export function isSpawnBlockedForMap(
  x: number,
  z: number,
  map: MapCollisionDef,
  feetY = 0,
): boolean {
  const mesh = meshForMap(map);
  if (mesh?.isReady) {
    return mesh.isSpawnBlocked(x, z, feetY);
  }
  return false;
}
