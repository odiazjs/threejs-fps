/** Vertical layout scale (was 0.85; +15% height). */
export const BODY_HIT_HEIGHT_SCALE = 0.85 * 1.15;

/** Uniform inflate on hit capsule radii. */
export const BODY_HIT_RADIUS_SCALE = 1.1;

const S = BODY_HIT_HEIGHT_SCALE;
const R = BODY_HIT_RADIUS_SCALE;

export type BodyPartId = import('./bodyParts.js').BodyPartId;

/** Oriented capsule used for hit tests (sphere centers at A and B). */
export interface BodyPartVolume {
  part: BodyPartId;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
}

const HIT_RADII: Record<BodyPartId, number> = {
  feet: 0.1 * S * R,
  legs: 0.13 * S * R,
  torso: 0.21 * S * R,
  arms: 0.17 * S * R,
  head: 0.15 * S * R,
};

type Vec3 = { x: number; y: number; z: number };

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  };
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function dedupeJoints(joints: Vec3[], epsilonSq = 0.02 * 0.02): Vec3[] {
  const out: Vec3[] = [];
  for (const joint of joints) {
    const prev = out[out.length - 1];
    if (prev && distSq(prev, joint) <= epsilonSq) continue;
    out.push(joint);
  }
  return out;
}

function volume(
  part: BodyPartId,
  a: Vec3,
  b: Vec3,
  radius = HIT_RADII[part],
): BodyPartVolume {
  return {
    part,
    ax: a.x,
    ay: a.y,
    az: a.z,
    bx: b.x,
    by: b.y,
    bz: b.z,
    radius,
  };
}

function pushLimbChain(volumes: BodyPartVolume[], joints: Vec3[]): void {
  const chain = dedupeJoints(joints);
  if (chain.length === 0) return;

  if (chain.length === 1) {
    const p = chain[0]!;
    volumes.push(volume('arms', p, p));
    return;
  }

  for (let i = 0; i < chain.length - 1; i++) {
    volumes.push(volume('arms', chain[i]!, chain[i + 1]!));
  }
}

/**
 * Build world-space hit capsules from skeleton bone positions.
 * Same layout used for debug wireframes and projectile/melee tests.
 */
export function bodyPartVolumesFromBoneRefs(bones: {
  head: Vec3;
  spine: Vec3;
  hips: Vec3;
  leftFoot: Vec3;
  rightFoot: Vec3;
  leftShoulder: Vec3 | null;
  rightShoulder: Vec3 | null;
  leftArm: Vec3;
  rightArm: Vec3;
  leftForeArm: Vec3 | null;
  rightForeArm: Vec3 | null;
  leftHand: Vec3;
  rightHand: Vec3;
}): BodyPartVolume[] {
  const footCenter = midpoint(bones.leftFoot, bones.rightFoot);
  const feetBottomY = Math.min(bones.leftFoot.y, bones.rightFoot.y);
  const legsTopY = bones.hips.y - 0.04 * S;
  const torsoBottomY = bones.hips.y - 0.02 * S;
  const torsoTopY = bones.spine.y + 0.16 * S;
  const headBottomY = bones.spine.y + 0.08 * S;
  const headTopY = Math.max(bones.head.y + 0.12 * S, headBottomY + 0.2 * S);

  const volumes: BodyPartVolume[] = [
    volume(
      'feet',
      { x: footCenter.x, y: feetBottomY + 0.05 * S, z: footCenter.z },
      { x: footCenter.x, y: feetBottomY + 0.05 * S, z: footCenter.z },
    ),
    volume(
      'legs',
      bones.leftFoot,
      { x: bones.leftFoot.x, y: legsTopY, z: bones.hips.z },
    ),
    volume(
      'legs',
      bones.rightFoot,
      { x: bones.rightFoot.x, y: legsTopY, z: bones.hips.z },
    ),
    volume(
      'torso',
      { x: bones.hips.x, y: torsoBottomY, z: bones.hips.z },
      { x: bones.spine.x, y: torsoTopY, z: bones.spine.z },
    ),
  ];

  pushLimbChain(volumes, [
    bones.leftShoulder ?? bones.leftArm,
    bones.leftForeArm,
    bones.leftHand,
  ].filter((joint): joint is Vec3 => joint !== null));

  pushLimbChain(volumes, [
    bones.rightShoulder ?? bones.rightArm,
    bones.rightForeArm,
    bones.rightHand,
  ].filter((joint): joint is Vec3 => joint !== null));

  volumes.push(
    volume(
      'head',
      { x: bones.head.x, y: headBottomY, z: bones.head.z },
      { x: bones.head.x, y: headTopY, z: bones.head.z },
    ),
  );

  return volumes;
}
