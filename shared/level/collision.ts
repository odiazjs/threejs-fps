import {
  EYE_HEIGHT,
  GROUND_SNAP,
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  type Aabb,
} from './levelData.js';
import { getLevelColliders } from './kiloSectorColliders.js';

export type { Aabb };

const EPS = 1e-4;
const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY) + 0.5;

export interface PlayerPhysicsState {
  verticalVelocity: number;
  grounded: boolean;
}

function playerAabb(feetX: number, feetY: number, feetZ: number): Aabb {
  return {
    minX: feetX - PLAYER_HALF_WIDTH,
    maxX: feetX + PLAYER_HALF_WIDTH,
    minY: feetY,
    maxY: feetY + PLAYER_HEIGHT,
    minZ: feetZ - PLAYER_HALF_WIDTH,
    maxZ: feetZ + PLAYER_HALF_WIDTH,
  };
}

function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

function overlapsXZ(feetX: number, feetZ: number, box: Aabb): boolean {
  return (
    feetX + PLAYER_HALF_WIDTH > box.minX &&
    feetX - PLAYER_HALF_WIDTH < box.maxX &&
    feetZ + PLAYER_HALF_WIDTH > box.minZ &&
    feetZ - PLAYER_HALF_WIDTH < box.maxZ
  );
}

export function getGroundHeight(feetX: number, feetZ: number, feetY: number): number {
  let ground = 0;

  for (const box of getLevelColliders()) {
    if (!overlapsXZ(feetX, feetZ, box)) continue;
    if (box.maxY <= feetY + GROUND_SNAP) {
      ground = Math.max(ground, box.maxY);
    }
  }

  return ground;
}

function resolveAxis(
  feetX: number,
  feetY: number,
  feetZ: number,
  axis: 'x' | 'z',
  delta: number,
  colliders: Aabb[],
): number {
  if (delta === 0) return axis === 'x' ? feetX : feetZ;

  let value = (axis === 'x' ? feetX : feetZ) + delta;

  for (const box of colliders) {
    const player = playerAabb(
      axis === 'x' ? value : feetX,
      feetY,
      axis === 'z' ? value : feetZ,
    );

    if (!overlaps(player, box)) continue;

    value =
      axis === 'x'
        ? delta > 0
          ? box.minX - PLAYER_HALF_WIDTH - EPS
          : box.maxX + PLAYER_HALF_WIDTH + EPS
        : delta > 0
          ? box.minZ - PLAYER_HALF_WIDTH - EPS
          : box.maxZ + PLAYER_HALF_WIDTH + EPS;
  }

  return value;
}

function resolveCeiling(feetX: number, feetY: number, feetZ: number, nextFeetY: number): number {
  const headDelta = nextFeetY - feetY;
  if (headDelta <= 0) return nextFeetY;

  let cappedFeetY = nextFeetY;
  const nextHeadY = nextFeetY + PLAYER_HEIGHT;

  for (const box of getLevelColliders()) {
    const player = playerAabb(feetX, feetY, feetZ);
    if (!overlapsXZ(feetX, feetZ, box)) continue;
    if (box.minY <= player.maxY + EPS || box.minY > nextHeadY) continue;

    cappedFeetY = Math.min(cappedFeetY, box.minY - PLAYER_HEIGHT - EPS);
  }

  return cappedFeetY;
}

export function movePlayer(
  feetX: number,
  feetY: number,
  feetZ: number,
  deltaX: number,
  deltaZ: number,
): { x: number; y: number; z: number } {
  const colliders = getLevelColliders();
  const x = resolveAxis(feetX, feetY, feetZ, 'x', deltaX, colliders);
  const z = resolveAxis(x, feetY, feetZ, 'z', deltaZ, colliders);

  return { x, y: feetY, z };
}

export function stepPlayerPhysics(
  feetX: number,
  feetY: number,
  feetZ: number,
  state: PlayerPhysicsState,
  deltaX: number,
  deltaZ: number,
  jump: boolean,
  delta: number,
): { x: number; y: number; z: number; state: PlayerPhysicsState } {
  let { verticalVelocity, grounded } = state;

  if (jump && grounded) {
    verticalVelocity = JUMP_VELOCITY;
    grounded = false;
  }

  verticalVelocity -= GRAVITY * delta;
  let nextFeetY = feetY + verticalVelocity * delta;
  nextFeetY = resolveCeiling(feetX, feetY, feetZ, nextFeetY);

  const ground = getGroundHeight(feetX, feetZ, feetY);
  if (nextFeetY <= ground) {
    nextFeetY = ground;
    verticalVelocity = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  const horizontal = movePlayer(feetX, nextFeetY, feetZ, deltaX, deltaZ);
  const groundAfter = getGroundHeight(horizontal.x, horizontal.z, nextFeetY);

  if (nextFeetY <= groundAfter + GROUND_SNAP && verticalVelocity <= 0) {
    nextFeetY = groundAfter;
    verticalVelocity = 0;
    grounded = true;
  }

  return {
    x: horizontal.x,
    y: nextFeetY,
    z: horizontal.z,
    state: { verticalVelocity, grounded },
  };
}

export function clampEyeY(feetX: number, feetZ: number, eyeY: number): number {
  const feetY = eyeY - EYE_HEIGHT;
  const ground = getGroundHeight(feetX, feetZ, feetY);
  const minEyeY = ground + EYE_HEIGHT;
  const maxEyeY = ground + EYE_HEIGHT + MAX_JUMP_HEIGHT;
  return Math.max(minEyeY, Math.min(eyeY, maxEyeY));
}

export { EYE_HEIGHT, GRAVITY, JUMP_VELOCITY };
