import {
  GRENADE_AIR_DRAG,
  GRENADE_COLLISION_RADIUS,
  GRENADE_GRAVITY,
  GRENADE_GROUND_FRICTION,
  GRENADE_GROUND_RESTITUTION,
  GRENADE_MAX_BOUNCES,
  GRENADE_MAX_PHYSICS_STEP,
  GRENADE_MAX_PHYSICS_SUBSTEPS,
  GRENADE_PLAYER_RESTITUTION,
  GRENADE_ROLL_STOP_SPEED,
  GRENADE_THROW_SPEED,
  GRENADE_THROW_UPWARD,
  GRENADE_WALL_RESTITUTION,
} from '../throwables/grenadeConfig.js';
import type { GrenadeWorldRaycast } from './grenadeWorldCollision.js';
import {
  testGrenadeSegmentAgainstShieldDomes,
  type GrenadeShieldDome,
} from './grenadeShieldDome.js';
import {
  testGrenadeSegmentAgainstPlayers,
  type GrenadePlayerCollider,
} from './grenadePlayerCollision.js';

export interface GrenadeMotionState {
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  grounded: boolean;
  bounceCount: number;
}

export interface GroundHeightSampler {
  (x: number, z: number): number;
}

export function createGrenadeMotionState(
  x: number,
  y: number,
  z: number,
  velX: number,
  velY: number,
  velZ: number,
): GrenadeMotionState {
  return {
    x,
    y,
    z,
    velX,
    velY,
    velZ,
    grounded: false,
    bounceCount: 0,
  };
}

export function computeGrenadeThrowVelocity(
  dirX: number,
  dirY: number,
  dirZ: number,
  throwSpeed = GRENADE_THROW_SPEED,
  upward = GRENADE_THROW_UPWARD,
): { velX: number; velY: number; velZ: number } {
  const len = Math.hypot(dirX, dirY, dirZ);
  if (len <= 1e-8) {
    return { velX: 0, velY: upward, velZ: -throwSpeed };
  }
  const inv = throwSpeed / len;
  return {
    velX: dirX * inv,
    velY: dirY * inv + upward,
    velZ: dirZ * inv,
  };
}

export function grenadeDamageAtDistance(
  distance: number,
  maxDamage: number,
  blastRadius: number,
): number {
  if (distance >= blastRadius) return 0;
  const t = 1 - distance / blastRadius;
  return Math.round(maxDamage * t * t);
}

function reflectVelocity(
  state: GrenadeMotionState,
  nx: number,
  ny: number,
  nz: number,
  restitution: number,
): void {
  const dot = state.velX * nx + state.velY * ny + state.velZ * nz;
  if (dot >= 0) return;

  state.velX -= (1 + restitution) * dot * nx;
  state.velY -= (1 + restitution) * dot * ny;
  state.velZ -= (1 + restitution) * dot * nz;
  state.bounceCount += 1;
}

function applyAirDrag(state: GrenadeMotionState, delta: number): void {
  const drag = Math.exp(-GRENADE_AIR_DRAG * delta);
  state.velX *= drag;
  state.velY *= drag;
  state.velZ *= drag;
}

function settleIfSlow(state: GrenadeMotionState): void {
  const speed = Math.hypot(state.velX, state.velY, state.velZ);
  if (speed < GRENADE_ROLL_STOP_SPEED || state.bounceCount >= GRENADE_MAX_BOUNCES) {
    state.velX = 0;
    state.velY = 0;
    state.velZ = 0;
    state.grounded = true;
  }
}

function isWallLikeNormal(ny: number): boolean {
  return Math.abs(ny) < 0.55;
}

export interface GrenadeMotionCollisionOptions {
  worldRaycast?: GrenadeWorldRaycast | null;
  shieldDomes?: readonly GrenadeShieldDome[];
  worldTime?: number;
  players?: readonly GrenadePlayerCollider[];
  /** Skip this player (usually the thrower) for a short grace after release. */
  ignorePlayerSessionId?: string;
}

function integrateGrenadeMotion(
  state: GrenadeMotionState,
  delta: number,
  sampleGround: GroundHeightSampler,
  options?: GrenadeMotionCollisionOptions,
): void {
  applyAirDrag(state, delta);
  state.velY -= GRENADE_GRAVITY * delta;

  const prevX = state.x;
  const prevY = state.y;
  const prevZ = state.z;
  const moveX = state.velX * delta;
  const moveY = state.velY * delta;
  const moveZ = state.velZ * delta;

  let nextX = prevX + moveX;
  let nextY = prevY + moveY;
  let nextZ = prevZ + moveZ;

  const moveLen = Math.hypot(moveX, moveY, moveZ);
  let surfaceHit: {
    distance: number;
    nx: number;
    ny: number;
    nz: number;
    restitution: number;
  } | null = null;

  if (options?.worldRaycast && moveLen > 1e-5) {
    const hit = options.worldRaycast.raycastSegment(
      prevX,
      prevY,
      prevZ,
      moveX,
      moveY,
      moveZ,
      moveLen,
    );
    if (hit && hit.distance <= moveLen && isWallLikeNormal(hit.ny)) {
      surfaceHit = {
        distance: hit.distance,
        nx: hit.nx,
        ny: hit.ny,
        nz: hit.nz,
        restitution: GRENADE_WALL_RESTITUTION,
      };
    }
  }

  if (options?.shieldDomes && options.worldTime !== undefined && moveLen > 1e-5) {
    const domeHit = testGrenadeSegmentAgainstShieldDomes(
      prevX,
      prevY,
      prevZ,
      nextX,
      nextY,
      nextZ,
      options.shieldDomes,
      options.worldTime,
    );
    if (domeHit && (!surfaceHit || domeHit.distance < surfaceHit.distance)) {
      surfaceHit = { ...domeHit, restitution: GRENADE_WALL_RESTITUTION };
    }
  }

  if (options?.players && options.players.length > 0 && moveLen > 1e-5) {
    const playerHit = testGrenadeSegmentAgainstPlayers(
      prevX,
      prevY,
      prevZ,
      nextX,
      nextY,
      nextZ,
      options.players,
      { ignoreSessionId: options.ignorePlayerSessionId },
    );
    if (playerHit && (!surfaceHit || playerHit.distance < surfaceHit.distance)) {
      surfaceHit = { ...playerHit, restitution: GRENADE_PLAYER_RESTITUTION };
    }
  }

  if (surfaceHit && surfaceHit.distance <= moveLen) {
    const travelT = surfaceHit.distance / moveLen;
    nextX = prevX + moveX * travelT;
    nextY = prevY + moveY * travelT;
    nextZ = prevZ + moveZ * travelT;
    reflectVelocity(state, surfaceHit.nx, surfaceHit.ny, surfaceHit.nz, surfaceHit.restitution);
    const pushOut = GRENADE_COLLISION_RADIUS * 0.5;
    nextX += surfaceHit.nx * pushOut;
    nextY += surfaceHit.ny * pushOut;
    nextZ += surfaceHit.nz * pushOut;
    settleIfSlow(state);
    if (state.grounded) {
      state.x = nextX;
      state.y = nextY;
      state.z = nextZ;
      return;
    }
  }

  state.x = nextX;
  state.y = nextY;
  state.z = nextZ;

  const groundY = sampleGround(state.x, state.z) + GRENADE_COLLISION_RADIUS;
  if (state.y <= groundY) {
    state.y = groundY;
    if (state.velY < -0.35) {
      state.velY = -state.velY * GRENADE_GROUND_RESTITUTION;
      state.bounceCount += 1;
    } else {
      state.velY = 0;
    }
    state.velX *= GRENADE_GROUND_FRICTION;
    state.velZ *= GRENADE_GROUND_FRICTION;
    settleIfSlow(state);
  }
}

/** Integrate one grenade physics step with ground + world + player collision. */
export function stepGrenadeMotion(
  state: GrenadeMotionState,
  delta: number,
  sampleGround: GroundHeightSampler,
  worldRaycast?: GrenadeWorldRaycast | null,
  shieldDomes?: readonly GrenadeShieldDome[],
  worldTime?: number,
  players?: readonly GrenadePlayerCollider[],
  ignorePlayerSessionId?: string,
): void {
  if (state.grounded) return;

  const options: GrenadeMotionCollisionOptions = {
    worldRaycast,
    shieldDomes,
    worldTime,
    players,
    ignorePlayerSessionId,
  };

  let remaining = delta;
  let subSteps = 0;

  while (remaining > 1e-6 && subSteps < GRENADE_MAX_PHYSICS_SUBSTEPS) {
    const speed = Math.hypot(state.velX, state.velY, state.velZ);
    const stepDelta =
      speed > 1e-4
        ? Math.min(remaining, GRENADE_MAX_PHYSICS_STEP / speed)
        : remaining;

    integrateGrenadeMotion(state, stepDelta, sampleGround, options);
    remaining -= stepDelta;
    subSteps += 1;

    if (state.grounded) break;
  }
}

export interface ArcPoint {
  x: number;
  y: number;
  z: number;
}

/** Predict grenade landing arc for the trajectory preview. */
export function predictGrenadeArc(
  originX: number,
  originY: number,
  originZ: number,
  velX: number,
  velY: number,
  velZ: number,
  sampleGround: GroundHeightSampler,
  maxDurationSec = 4,
  stepSec = 0.06,
): ArcPoint[] {
  return predictGrenadeArcPreview(
    originX,
    originY,
    originZ,
    velX,
    velY,
    velZ,
    sampleGround,
    maxDurationSec,
    stepSec,
  ).points;
}

export interface GrenadeArcPreviewResult {
  points: ArcPoint[];
  impactX: number;
  impactZ: number;
  /** Floor height for holo decals (slightly above terrain). */
  floorY: number;
}

/** Trajectory preview — single flight arc ending at first ground contact. */
export function predictGrenadeArcPreview(
  originX: number,
  originY: number,
  originZ: number,
  velX: number,
  velY: number,
  velZ: number,
  sampleGround: GroundHeightSampler,
  maxDurationSec = 4,
  stepSec = 0.04,
): GrenadeArcPreviewResult {
  const points: ArcPoint[] = [{ x: originX, y: originY, z: originZ }];
  const state = createGrenadeMotionState(originX, originY, originZ, velX, velY, velZ);

  let impactX = originX;
  let impactZ = originZ;
  let floorY = sampleGround(originX, originZ) + 0.04;

  const steps = Math.ceil(maxDurationSec / stepSec);
  for (let i = 0; i < steps; i++) {
    const groundCenterY = sampleGround(state.x, state.z) + GRENADE_COLLISION_RADIUS;
    const wasAboveGround = state.y > groundCenterY + 0.03;

    stepGrenadeMotion(state, stepSec, sampleGround);

    if (wasAboveGround && state.y <= groundCenterY + 0.03) {
      impactX = state.x;
      impactZ = state.z;
      floorY = sampleGround(impactX, impactZ) + 0.04;
      points.push({ x: impactX, y: groundCenterY, z: impactZ });
      break;
    }

    points.push({ x: state.x, y: state.y, z: state.z });
    if (state.grounded) break;
  }

  if (points.length === 1) {
    impactX = state.x;
    impactZ = state.z;
    floorY = sampleGround(impactX, impactZ) + 0.04;
    const groundCenterY = sampleGround(impactX, impactZ) + GRENADE_COLLISION_RADIUS;
    points.push({ x: impactX, y: groundCenterY, z: impactZ });
  }

  return { points, impactX, impactZ, floorY };
}
