import { CROUCH_EYE_HEIGHT } from '../combat/crouch.js';
import {
  EYE_HEIGHT,
  GROUND_SNAP,
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  type Aabb,
} from './levelData.js';
import { getClientMapDef, type MapCollisionDef } from './maps.js';

export type { Aabb };

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  distance: number;
}

const DEFAULT_RAYCAST_DISTANCE = 1000;

const EPS = 1e-4;
const GROUND_RAY_CLEARANCE = 0.06;
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

function isInBounds(x: number, z: number, map: MapCollisionDef): boolean {
  return Math.abs(x) <= map.mapHalfX && Math.abs(z) <= map.mapHalfZ;
}

export function getGroundHeight(
  feetX: number,
  feetZ: number,
  feetY: number,
  map: MapCollisionDef = getClientMapDef(),
): number {
  let ground = map.sampleGroundHeight(feetX, feetZ);

  for (const box of map.getLevelColliders()) {
    if (!overlapsXZ(feetX, feetZ, box)) continue;

    if (box.platform) {
      if (feetY + GROUND_SNAP >= box.minY) {
        ground = Math.max(ground, box.maxY);
      }
      continue;
    }

    if (box.maxY <= feetY + GROUND_SNAP) {
      ground = Math.max(ground, box.maxY);
    }
  }

  return ground;
}

function rayAabbIntersect(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: Aabb,
  maxDistance: number,
): number | null {
  let tMin = 0;
  let tMax = maxDistance;

  const axes: [number, number, number, number][] = [
    [dx, ox, box.minX, box.maxX],
    [dy, oy, box.minY, box.maxY],
    [dz, oz, box.minZ, box.maxZ],
  ];

  for (const [d, o, min, max] of axes) {
    if (Math.abs(d) < EPS) {
      if (o < min || o > max) return null;
      continue;
    }

    const inv = 1 / d;
    let t0 = (min - o) * inv;
    let t1 = (max - o) * inv;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }

    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }

  if (tMax < 0) return null;

  const t = tMin >= 0 ? tMin : tMax;
  return t <= maxDistance ? t : null;
}

function raycastGround(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
  map: MapCollisionDef,
  minDistance = 0,
): number | null {
  if (dy >= -EPS) return null;

  const startGround = map.sampleGroundHeight(ox, oz);
  if (oy <= startGround + GROUND_RAY_CLEARANCE) return null;

  let lo = minDistance;
  let hi = maxDistance;

  const endX = ox + dx * hi;
  const endZ = oz + dz * hi;
  const endY = oy + dy * hi;
  if (isInBounds(endX, endZ, map)) {
    const endGround = map.sampleGroundHeight(endX, endZ);
    if (endY > endGround + GROUND_RAY_CLEARANCE) return null;
  }

  for (let i = 0; i < 28; i++) {
    const t = (lo + hi) * 0.5;
    const px = ox + dx * t;
    const py = oy + dy * t;
    const pz = oz + dz * t;

    if (!isInBounds(px, pz, map)) {
      hi = t;
      continue;
    }

    if (py > map.sampleGroundHeight(px, pz) + GROUND_RAY_CLEARANCE) lo = t;
    else hi = t;
  }

  const t = hi;
  if (t <= minDistance + EPS || t > maxDistance) return null;

  const hx = ox + dx * t;
  const hz = oz + dz * t;
  if (!isInBounds(hx, hz, map)) return null;

  return t;
}

/** Raycast from the camera crosshair against level geometry. */
export function raycastLevel(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance = DEFAULT_RAYCAST_DISTANCE,
  minDistance = 0,
  map: MapCollisionDef = getClientMapDef(),
): RaycastHit | null {
  let closest: number | null = null;

  for (const box of map.getLevelColliders()) {
    const t = rayAabbIntersect(ox, oy, oz, dx, dy, dz, box, maxDistance);
    if (t === null || t < minDistance) continue;
    if (closest === null || t < closest) closest = t;
  }

  const groundT = raycastGround(ox, oy, oz, dx, dy, dz, maxDistance, map, minDistance);
  if (groundT !== null && groundT >= minDistance && (closest === null || groundT < closest)) {
    closest = groundT;
  }

  if (closest === null) return null;

  return {
    x: ox + dx * closest,
    y: oy + dy * closest,
    z: oz + dz * closest,
    distance: closest,
  };
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

    if (player.minY >= box.maxY - EPS) continue;
    if (player.maxY <= box.minY + EPS) continue;
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

function resolveCeiling(
  feetX: number,
  feetY: number,
  feetZ: number,
  nextFeetY: number,
  map: MapCollisionDef,
): number {
  const headDelta = nextFeetY - feetY;
  if (headDelta <= 0) return nextFeetY;

  let cappedFeetY = nextFeetY;
  const nextHeadY = nextFeetY + PLAYER_HEIGHT;

  for (const box of map.getLevelColliders()) {
    const player = playerAabb(feetX, feetY, feetZ);
    if (!overlapsXZ(feetX, feetZ, box)) continue;
    if (box.minY <= player.maxY + EPS || box.minY > nextHeadY) continue;

    cappedFeetY = Math.min(cappedFeetY, box.minY - PLAYER_HEIGHT - EPS);
  }

  return cappedFeetY;
}

function clampToMapBounds(
  x: number,
  z: number,
  map: MapCollisionDef,
): { x: number; z: number } {
  const wallPad = map.wallThickness > 0 ? map.wallThickness : 0.5;
  const limitX = map.mapHalfX - PLAYER_HALF_WIDTH - wallPad;
  const limitZ = map.mapHalfZ - PLAYER_HALF_WIDTH - wallPad;
  return {
    x: Math.max(-limitX, Math.min(limitX, x)),
    z: Math.max(-limitZ, Math.min(limitZ, z)),
  };
}

export function movePlayer(
  feetX: number,
  feetY: number,
  feetZ: number,
  deltaX: number,
  deltaZ: number,
  map: MapCollisionDef = getClientMapDef(),
): { x: number; y: number; z: number } {
  const colliders = map.getLevelColliders();
  const x = resolveAxis(feetX, feetY, feetZ, 'x', deltaX, colliders);
  const z = resolveAxis(x, feetY, feetZ, 'z', deltaZ, colliders);
  const bounded = clampToMapBounds(x, z, map);

  return { x: bounded.x, y: feetY, z: bounded.z };
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
  map: MapCollisionDef = getClientMapDef(),
): { x: number; y: number; z: number; state: PlayerPhysicsState } {
  let { verticalVelocity, grounded } = state;

  if (jump && grounded) {
    verticalVelocity = JUMP_VELOCITY;
    grounded = false;
  }

  verticalVelocity -= GRAVITY * delta;
  let nextFeetY = feetY + verticalVelocity * delta;
  nextFeetY = resolveCeiling(feetX, feetY, feetZ, nextFeetY, map);

  const ground = getGroundHeight(feetX, feetZ, feetY, map);
  if (nextFeetY <= ground) {
    nextFeetY = ground;
    verticalVelocity = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  const horizontal = movePlayer(feetX, nextFeetY, feetZ, deltaX, deltaZ, map);
  const groundAfter = getGroundHeight(horizontal.x, horizontal.z, nextFeetY, map);

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

export function clampEyeY(
  feetX: number,
  feetZ: number,
  eyeY: number,
  map: MapCollisionDef = getClientMapDef(),
  crouching = false,
): number {
  const standEyeHeight = EYE_HEIGHT;
  const feetY = eyeY - standEyeHeight;
  const ground = getGroundHeight(feetX, feetZ, feetY, map);
  const minEyeHeight = crouching ? CROUCH_EYE_HEIGHT : standEyeHeight;
  const minEyeY = ground + minEyeHeight;
  const maxEyeY = ground + standEyeHeight + MAX_JUMP_HEIGHT;
  return Math.max(minEyeY, Math.min(eyeY, maxEyeY));
}

/** Feet height used for server-side horizontal collision — matches client elevation on platforms. */
export function resolveMoveFeetY(
  feetX: number,
  feetZ: number,
  clientFeetY: number,
  map: MapCollisionDef = getClientMapDef(),
): number {
  const ground = getGroundHeight(feetX, feetZ, clientFeetY, map);
  return Math.min(Math.max(clientFeetY, ground), ground + MAX_JUMP_HEIGHT);
}

export { EYE_HEIGHT, GRAVITY, JUMP_VELOCITY };
