import {
  clampEyeY,
  movePlayer,
  stepPlayerPhysics,
  type PlayerPhysicsState,
} from '../../shared/level/collision';
import { CROUCH_EYE_HEIGHT } from '../../shared/combat/crouch';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { getClientGameplayColliders, type MapCollisionDef } from '../../shared/level/maps';
import type { LevelMeshBvhCollision } from '../world/LevelMeshBvhCollision';

let meshCollision: LevelMeshBvhCollision | null = null;

export function setLevelMeshBvhCollision(provider: LevelMeshBvhCollision | null): void {
  meshCollision = provider;
}

export function getLevelMeshBvhCollision(): LevelMeshBvhCollision | null {
  return meshCollision;
}

export function isLevelMeshMovementActive(): boolean {
  return meshCollision?.isReady ?? false;
}

function clientFallbackColliders(map: MapCollisionDef) {
  return getClientGameplayColliders(map);
}

export function stepPlayerPhysicsClient(
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
  if (meshCollision?.isReady) {
    return meshCollision.stepPlayerPhysics(
      feetX,
      feetY,
      feetZ,
      state,
      deltaX,
      deltaZ,
      jump,
      delta,
      map,
    );
  }

  const colliders = clientFallbackColliders(map);
  return stepPlayerPhysics(
    feetX,
    feetY,
    feetZ,
    state,
    deltaX,
    deltaZ,
    jump,
    delta,
    map,
    colliders,
  );
}

export function movePlayerClient(
  feetX: number,
  feetY: number,
  feetZ: number,
  deltaX: number,
  deltaZ: number,
  map: MapCollisionDef,
): { x: number; y: number; z: number } {
  if (meshCollision?.isReady) {
    return meshCollision.movePlayer(feetX, feetY, feetZ, deltaX, deltaZ, map);
  }

  return movePlayer(feetX, feetY, feetZ, deltaX, deltaZ, map, clientFallbackColliders(map));
}

export function clampEyeYClient(
  feetX: number,
  feetZ: number,
  eyeY: number,
  map: MapCollisionDef,
  crouching = false,
): number {
  if (meshCollision?.isReady) {
    return meshCollision.clampEyeY(
      feetX,
      feetZ,
      eyeY,
      map,
      crouching,
      EYE_HEIGHT,
      CROUCH_EYE_HEIGHT,
    );
  }

  return clampEyeY(feetX, feetZ, eyeY, map, crouching, clientFallbackColliders(map));
}
