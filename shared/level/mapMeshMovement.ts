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
import { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

let mapPhysics: LevelPhysicsWorld | null = null;

export function setMapPhysics(world: LevelPhysicsWorld | null): void {
  mapPhysics = world;
}

export function getMapPhysics(): LevelPhysicsWorld | null {
  return mapPhysics;
}

function physicsForMap(_map: MapCollisionDef): LevelPhysicsWorld | null {
  return mapPhysics?.isReady ? mapPhysics : null;
}

export function movePlayerForMap(
  feetX: number,
  feetY: number,
  feetZ: number,
  deltaX: number,
  deltaZ: number,
  map: MapCollisionDef,
): { x: number; y: number; z: number } {
  const physics = physicsForMap(map);
  if (physics?.isReady) {
    return physics.movePlayer(feetX, feetY, feetZ, deltaX, deltaZ, map);
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
  const physics = physicsForMap(map);
  if (physics?.isReady) {
    return physics.stepPlayerPhysics(feetX, feetY, feetZ, state, deltaX, deltaZ, jump, delta, map);
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
  const physics = physicsForMap(map);
  if (physics?.isReady) {
    return physics.clampEyeY(
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
  const physics = physicsForMap(map);
  if (physics?.isReady) {
    return physics.resolveMoveFeetY(feetX, feetZ, clientFeetY, map);
  }
  return resolveMoveFeetY(feetX, feetZ, clientFeetY, map);
}

export function getSpawnCollidersForMap(map: MapCollisionDef) {
  if (map.usesMeshCollision && mapPhysics?.isReady) {
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
  const physics = physicsForMap(map);
  if (physics?.isReady) {
    return physics.isSpawnBlocked(x, z, feetY);
  }
  return false;
}
