import { EYE_HEIGHT } from '../level/levelData.js';
import {
  PLAYER_HIT_CAPSULE_HEIGHT,
  raycastPlayerBodyPart,
  resolveBodyPartFromWorldPoint,
  type BodyPartId,
  type PlayerHitTarget,
} from './playerHitbox.js';

/** Half-angle of the melee hit cone around the look direction (radians). */
export const MELEE_AIM_HALF_ANGLE_RAD = (40 * Math.PI) / 180;

export interface MeleeAim {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly dirZ: number;
}

export interface MeleeHitCandidate extends PlayerHitTarget {
  readonly sessionId: string;
}

export interface MeleeHitResult {
  readonly sessionId: string;
  readonly pointX: number;
  readonly pointY: number;
  readonly pointZ: number;
  readonly bodyPart: BodyPartId;
}

/** World look direction from pointer-aim yaw/pitch (YXZ, forward = -Z). */
export function aimDirectionFromYawPitch(
  yaw: number,
  pitch: number,
): { x: number; y: number; z: number } {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}

function targetCenterY(feetY: number): number {
  return feetY + PLAYER_HIT_CAPSULE_HEIGHT * 0.55;
}

function isTargetInMeleeCone(
  aim: MeleeAim,
  target: PlayerHitTarget,
  range: number,
  aimHalfAngleRad: number,
): boolean {
  const centerX = target.feetX;
  const centerY = targetCenterY(target.feetY);
  const centerZ = target.feetZ;

  const toX = centerX - aim.eyeX;
  const toY = centerY - aim.eyeY;
  const toZ = centerZ - aim.eyeZ;
  const distanceSq = toX * toX + toY * toY + toZ * toZ;
  if (distanceSq <= 1e-8 || distanceSq > range * range) return false;

  const invDist = 1 / Math.sqrt(distanceSq);
  const nx = toX * invDist;
  const ny = toY * invDist;
  const nz = toZ * invDist;
  const dot = aim.dirX * nx + aim.dirY * ny + aim.dirZ * nz;
  return dot >= Math.cos(aimHalfAngleRad);
}

/** Closest enemy in the look cone within melee range. */
export function findMeleeHitTarget(
  aim: MeleeAim,
  range: number,
  targets: readonly MeleeHitCandidate[],
  excludeSessionId?: string,
  aimHalfAngleRad = MELEE_AIM_HALF_ANGLE_RAD,
): MeleeHitResult | null {
  let best: MeleeHitResult | null = null;
  let bestDistance = Infinity;

  for (const target of targets) {
    if (excludeSessionId && target.sessionId === excludeSessionId) continue;
    if (!isTargetInMeleeCone(aim, target, range, aimHalfAngleRad)) continue;

    const bodyHit = raycastPlayerBodyPart(
      aim.eyeX,
      aim.eyeY,
      aim.eyeZ,
      aim.dirX,
      aim.dirY,
      aim.dirZ,
      range,
      target,
    );

    if (bodyHit) {
      if (bodyHit.distance >= bestDistance) continue;
      bestDistance = bodyHit.distance;
      const pointX = aim.eyeX + aim.dirX * bodyHit.distance;
      const pointY = aim.eyeY + aim.dirY * bodyHit.distance;
      const pointZ = aim.eyeZ + aim.dirZ * bodyHit.distance;
      best = {
        sessionId: target.sessionId,
        pointX,
        pointY,
        pointZ,
        bodyPart: bodyHit.part,
      };
      continue;
    }

    const centerX = target.feetX;
    const centerY = targetCenterY(target.feetY);
    const centerZ = target.feetZ;
    const toX = centerX - aim.eyeX;
    const toY = centerY - aim.eyeY;
    const toZ = centerZ - aim.eyeZ;
    const distanceSq = toX * toX + toY * toY + toZ * toZ;
    if (distanceSq >= bestDistance * bestDistance) continue;

    bestDistance = Math.sqrt(distanceSq);
    best = {
      sessionId: target.sessionId,
      pointX: centerX,
      pointY: centerY,
      pointZ: centerZ,
      bodyPart: resolveBodyPartFromWorldPoint(centerX, centerY, centerZ, target),
    };
  }

  return best;
}

/** Server-side validation using replicated eye position and yaw/pitch. */
export function isMeleeHitValid(
  shooterEyeX: number,
  shooterEyeY: number,
  shooterEyeZ: number,
  shooterYaw: number,
  shooterPitch: number,
  targetFeetX: number,
  targetFeetY: number,
  targetFeetZ: number,
  range: number,
  aimHalfAngleRad = MELEE_AIM_HALF_ANGLE_RAD,
): boolean {
  const dir = aimDirectionFromYawPitch(shooterYaw, shooterPitch);
  return isTargetInMeleeCone(
    {
      eyeX: shooterEyeX,
      eyeY: shooterEyeY,
      eyeZ: shooterEyeZ,
      dirX: dir.x,
      dirY: dir.y,
      dirZ: dir.z,
    },
    { feetX: targetFeetX, feetY: targetFeetY, feetZ: targetFeetZ },
    range,
    aimHalfAngleRad,
  );
}

export function feetYFromEyeY(eyeY: number): number {
  return eyeY - EYE_HEIGHT;
}
