import { CAPSULE_RADIUS } from './capsuleConfig.js';
import type { LevelPhysicsWorld } from './levelPhysicsWorld.js';

/** Rifle / extended arms beyond the movement capsule radius. */
export const FORWARD_LIMB_REACH = 0.46;

const STAND_PROBE_HEIGHT = 1.05;
const CROUCH_PROBE_HEIGHT = 0.68;
const MIN_RAY_START = CAPSULE_RADIUS * 0.35;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function probeChestY(feetY: number, crouching: boolean): number {
  return feetY + (crouching ? CROUCH_PROBE_HEIGHT : STAND_PROBE_HEIGHT);
}

/**
 * Push feet XZ back when a wall is closer than capsule + weapon reach ahead.
 * Keeps third-person weapon meshes from penetrating thin props (e.g. house walls).
 */
export function applyForwardLimbWallClearance(
  physics: LevelPhysicsWorld | null | undefined,
  feetX: number,
  feetY: number,
  feetZ: number,
  dirX: number,
  dirZ: number,
  crouching = false,
): { x: number; z: number } {
  if (!physics?.isReady) return { x: feetX, z: feetZ };

  const flatLen = Math.hypot(dirX, dirZ);
  if (flatLen < 1e-6) return { x: feetX, z: feetZ };

  const dx = dirX / flatLen;
  const dz = dirZ / flatLen;
  const maxDistance = CAPSULE_RADIUS + FORWARD_LIMB_REACH;
  const originY = probeChestY(feetY, crouching);

  const hit = physics.raycast(
    feetX,
    originY,
    feetZ,
    dx,
    0,
    dz,
    maxDistance,
    MIN_RAY_START,
  );
  if (!hit) return { x: feetX, z: feetZ };

  const push = maxDistance - hit.distance;
  if (push <= 0) return { x: feetX, z: feetZ };

  return { x: feetX - dx * push, z: feetZ - dz * push };
}

/** Pull the first-person view weapon toward the camera when it would intersect geometry. */
export function measureViewWeaponWallPullback(
  physics: LevelPhysicsWorld | null | undefined,
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  weaponReach: number,
): number {
  if (!physics?.isReady || weaponReach <= 0) return 0;

  const len = Math.hypot(dirX, dirY, dirZ);
  if (len < 1e-6) return 0;

  const hit = physics.raycast(
    originX,
    originY,
    originZ,
    dirX / len,
    dirY / len,
    dirZ / len,
    weaponReach,
    0.06,
  );
  if (!hit) return 0;

  return Math.max(0, weaponReach - hit.distance);
}

/** 0 = wall flush with reach, 1 = fully extended. */
export function measureForwardLimbClearanceFactor(
  physics: LevelPhysicsWorld | null | undefined,
  feetX: number,
  feetY: number,
  feetZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  crouching = false,
): number {
  if (!physics?.isReady) return 1;

  const len = Math.hypot(dirX, dirY, dirZ);
  if (len < 1e-6) return 1;

  const maxDistance = CAPSULE_RADIUS + FORWARD_LIMB_REACH;
  const originY = probeChestY(feetY, crouching);
  const hit = physics.raycast(
    feetX,
    originY,
    feetZ,
    dirX / len,
    dirY / len,
    dirZ / len,
    maxDistance,
    MIN_RAY_START,
  );
  if (!hit) return 1;

  return clamp(hit.distance / maxDistance, 0.15, 1);
}
