import type { BodyPartDef, BodyPartId } from './bodyParts.js';
import {
  BODY_HIT_HEIGHT_SCALE,
  bodyPartVolumesFromBoneRefs,
  type BodyPartVolume,
} from './bodyPartVolumes.js';

export { BODY_HIT_HEIGHT_SCALE };

export const CHARACTER_HIT_HEIGHT = 1.65 * BODY_HIT_HEIGHT_SCALE;

export interface BodyPartCapsulePose {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
  /** Total capsule height including end hemispheres. */
  height: number;
  /** Optional axis endpoints for oriented debug capsules. */
  axisAx?: number;
  axisAy?: number;
  axisAz?: number;
  axisBx?: number;
  axisBy?: number;
  axisBz?: number;
}

export interface BodyPartBoneRefs {
  head: { x: number; y: number; z: number };
  spine: { x: number; y: number; z: number };
  hips: { x: number; y: number; z: number };
  leftFoot: { x: number; y: number; z: number };
  rightFoot: { x: number; y: number; z: number };
  leftArm: { x: number; y: number; z: number };
  rightArm: { x: number; y: number; z: number };
  leftShoulder: { x: number; y: number; z: number } | null;
  rightShoulder: { x: number; y: number; z: number } | null;
  leftForeArm: { x: number; y: number; z: number } | null;
  rightForeArm: { x: number; y: number; z: number } | null;
  leftHand: { x: number; y: number; z: number };
  rightHand: { x: number; y: number; z: number };
}

export function partCapsuleCenterY(part: BodyPartDef): number {
  return (part.minY + part.maxY) * 0.5;
}

export function volumeToCapsulePose(vol: BodyPartVolume): BodyPartCapsulePose {
  const height = Math.max(
    vol.radius * 2 + 0.02,
    Math.hypot(vol.ax - vol.bx, vol.ay - vol.by, vol.az - vol.bz) + vol.radius * 2,
  );
  return {
    centerX: (vol.ax + vol.bx) * 0.5,
    centerY: (vol.ay + vol.by) * 0.5,
    centerZ: (vol.az + vol.bz) * 0.5,
    radius: vol.radius,
    height,
    axisAx: vol.ax,
    axisAy: vol.ay,
    axisAz: vol.az,
    axisBx: vol.bx,
    axisBy: vol.by,
    axisBz: vol.bz,
  };
}

/** Derive capsule poses from measured bone positions (body-local or world). */
export function measureBodyPartPosesFromBones(
  bones: BodyPartBoneRefs,
): Record<BodyPartId, BodyPartCapsulePose | BodyPartCapsulePose[]> {
  const volumes = bodyPartVolumesFromBoneRefs(bones);
  const legs: BodyPartCapsulePose[] = [];
  const arms: BodyPartCapsulePose[] = [];
  let feet: BodyPartCapsulePose | null = null;
  let torso: BodyPartCapsulePose | null = null;
  let head: BodyPartCapsulePose | null = null;

  for (const vol of volumes) {
    const pose = volumeToCapsulePose(vol);
    switch (vol.part) {
      case 'feet':
        feet = pose;
        break;
      case 'legs':
        legs.push(pose);
        break;
      case 'torso':
        torso = pose;
        break;
      case 'arms':
        arms.push(pose);
        break;
      case 'head':
        head = pose;
        break;
      default:
        break;
    }
  }

  return {
    feet: feet ?? volumeToCapsulePose(volumes[0]!),
    legs,
    torso: torso ?? volumeToCapsulePose(volumes[3]!),
    arms,
    head: head ?? volumeToCapsulePose(volumes[volumes.length - 1]!),
  };
}

export function staticBodyPartPose(part: BodyPartDef, side: -1 | 0 | 1 = 0): BodyPartCapsulePose {
  const x = part.localOffsetX * side;
  const z = -part.localOffsetZ;
  const ax = x;
  const ay = part.minY + part.radius;
  const az = z;
  const bx = x;
  const by = part.maxY - part.radius;
  const bz = z;
  return volumeToCapsulePose({
    part: part.id,
    ax,
    ay,
    az,
    bx,
    by,
    bz,
    radius: part.radius,
  });
}
