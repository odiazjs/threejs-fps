import { BODY_HIT_HEIGHT_SCALE, CHARACTER_HIT_HEIGHT } from './bodyPartPose.js';
import { BODY_HIT_RADIUS_SCALE } from './bodyPartVolumes.js';

export type BodyPartId = 'head' | 'torso' | 'arms' | 'legs' | 'feet';

export { BODY_HIT_HEIGHT_SCALE };

const S = BODY_HIT_HEIGHT_SCALE;
const R = BODY_HIT_RADIUS_SCALE;
const y = (value: number) => value * S;

export interface BodyPartDef {
  id: BodyPartId;
  label: string;
  /** Capsule bottom (lower hemisphere center) relative to feet. */
  minY: number;
  /** Capsule top (upper hemisphere apex) relative to feet. */
  maxY: number;
  radius: number;
  /** Lateral offset from spine in player-local space (+X = right). */
  localOffsetX: number;
  /** Forward offset from spine in body-local space (−Z is forward at yaw 0). */
  localOffsetZ: number;
  damageMultiplier: number;
}

/** Spine/hip pitch pivot — upper body rotates around this Y (feet-local). */
export const HIP_PIVOT_Y = y(0.94);

/**
 * Static hit volumes tuned to the fitted Mixamo character.
 * Values approximate the rifle-aiming idle pose; debug meshes follow bones each frame.
 */
export const BODY_PARTS: readonly BodyPartDef[] = [
  {
    id: 'feet',
    label: 'Feet',
    minY: y(0),
    maxY: y(0.11),
    radius: 0.1 * S * R,
    localOffsetX: 0,
    localOffsetZ: 0,
    damageMultiplier: 0.85,
  },
  {
    id: 'legs',
    label: 'Legs',
    minY: y(0.06),
    maxY: HIP_PIVOT_Y - y(0.02),
    radius: 0.13 * S * R,
    localOffsetX: y(0.11),
    localOffsetZ: 0,
    damageMultiplier: 1.0,
  },
  {
    id: 'torso',
    label: 'Torso',
    minY: HIP_PIVOT_Y - y(0.04),
    maxY: y(1.36),
    radius: 0.21 * S * R,
    localOffsetX: 0,
    localOffsetZ: 0,
    damageMultiplier: 1.0,
  },
  {
    id: 'arms',
    label: 'Arms',
    minY: y(1.0),
    maxY: y(1.26),
    radius: 0.17 * S * R,
    localOffsetX: y(0.18),
    localOffsetZ: y(0.24),
    damageMultiplier: 0.9,
  },
  {
    id: 'head',
    label: 'Head',
    minY: y(1.28),
    maxY: CHARACTER_HIT_HEIGHT,
    radius: 0.15 * S * R,
    localOffsetX: 0,
    localOffsetZ: 0,
    damageMultiplier: 2.0,
  },
] as const;

const BODY_PART_BY_ID = new Map<BodyPartId, BodyPartDef>(
  BODY_PARTS.map((part) => [part.id, part]),
);

export function isValidBodyPartId(value: string | null | undefined): value is BodyPartId {
  return value === 'head'
    || value === 'torso'
    || value === 'arms'
    || value === 'legs'
    || value === 'feet';
}

export function getBodyPartDef(partId: BodyPartId): BodyPartDef {
  return BODY_PART_BY_ID.get(partId)!;
}

export function getBodyPartDamageMultiplier(partId: BodyPartId): number {
  return getBodyPartDef(partId).damageMultiplier;
}

export function normalizeBodyPartId(value: string | null | undefined): BodyPartId {
  return isValidBodyPartId(value) ? value : 'torso';
}

export function partUsesUpperBodyPitch(partId: BodyPartId): boolean {
  return partId === 'torso' || partId === 'arms' || partId === 'head';
}

/** Player-local +X (right) and forward (−Z at yaw 0) basis from aim yaw. */
export function playerLocalBasis(yaw: number): {
  rightX: number;
  rightZ: number;
  forwardX: number;
  forwardZ: number;
} {
  return {
    rightX: Math.cos(yaw),
    rightZ: -Math.sin(yaw),
    forwardX: -Math.sin(yaw),
    forwardZ: -Math.cos(yaw),
  };
}

/** Rotate a body-local offset (right = +X, forward = −Z) into world XZ. */
export function bodyLocalOffsetToWorld(
  yaw: number,
  localX: number,
  localZ: number,
): { x: number; z: number } {
  const basis = playerLocalBasis(yaw);
  return {
    x: basis.rightX * localX + basis.forwardX * localZ,
    z: basis.rightZ * localX + basis.forwardZ * localZ,
  };
}

/** Match remote spine pitch: upper body rotates −pitch around hip X. */
export function pitchBodyLocalPoint(
  x: number,
  y: number,
  z: number,
  pitch: number,
  hipY = HIP_PIVOT_Y,
): { x: number; y: number; z: number } {
  if (Math.abs(pitch) < 1e-6) return { x, y, z };

  const relY = y - hipY;
  const cos = Math.cos(-pitch);
  const sin = Math.sin(-pitch);
  return {
    x,
    y: hipY + relY * cos - z * sin,
    z: relY * sin + z * cos,
  };
}

/** Inverse hip pitch for transforming rays into unpitched body-local space. */
export function unpitchBodyLocalPoint(
  x: number,
  y: number,
  z: number,
  pitch: number,
  hipY = HIP_PIVOT_Y,
): { x: number; y: number; z: number } {
  if (Math.abs(pitch) < 1e-6) return { x, y, z };

  const relY = y - hipY;
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  return {
    x,
    y: hipY + relY * cos - z * sin,
    z: relY * sin + z * cos,
  };
}

export function worldOffsetToBodyLocal(
  dx: number,
  dz: number,
  yaw: number,
): { x: number; z: number } {
  const basis = playerLocalBasis(yaw);
  return {
    x: dx * basis.rightX + dz * basis.rightZ,
    z: dx * basis.forwardX + dz * basis.forwardZ,
  };
}

export function bodyLocalPointToWorld(
  feetX: number,
  feetY: number,
  feetZ: number,
  yaw: number,
  pitch: number,
  localX: number,
  localY: number,
  localZ: number,
  applyPitch: boolean,
): { x: number; y: number; z: number } {
  const pitched = applyPitch
    ? pitchBodyLocalPoint(localX, localY, localZ, pitch)
    : { x: localX, y: localY, z: localZ };
  const xz = bodyLocalOffsetToWorld(yaw, pitched.x, pitched.z);
  return {
    x: feetX + xz.x,
    y: feetY + pitched.y,
    z: feetZ + xz.z,
  };
}

export function partSides(part: BodyPartDef): ReadonlyArray<-1 | 0 | 1> {
  if ((part.id === 'arms' || part.id === 'legs') && part.localOffsetX > 0) {
    return [-1, 1];
  }
  return [0];
}

export function partBodyLocalEndpoints(
  part: BodyPartDef,
  side: -1 | 0 | 1,
): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } {
  const x = part.localOffsetX * side;
  const z = -part.localOffsetZ;
  return {
    ax: x,
    ay: part.minY,
    az: z,
    bx: x,
    by: part.maxY,
    bz: z,
  };
}

/** Hemisphere centers for capsule ray tests (iq ray-capsule convention). */
export function partBodyLocalCapCenters(
  part: BodyPartDef,
  side: -1 | 0 | 1,
): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } {
  const x = part.localOffsetX * side;
  const z = -part.localOffsetZ;
  const r = part.radius;
  const height = part.maxY - part.minY;
  if (height <= r * 2 + 1e-6) {
    const midY = (part.minY + part.maxY) * 0.5;
    return { ax: x, ay: midY, az: z, bx: x, by: midY, bz: z };
  }
  return {
    ax: x,
    ay: part.minY + r,
    az: z,
    bx: x,
    by: part.maxY - r,
    bz: z,
  };
}

export function partCapsuleHeight(part: BodyPartDef): number {
  return Math.max(0.04, part.maxY - part.minY);
}

export function partWorldEndpoints(
  target: { feetX: number; feetY: number; feetZ: number; yaw?: number; pitch?: number },
  part: BodyPartDef,
  side: -1 | 0 | 1,
): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } {
  const local = partBodyLocalCapCenters(part, side);
  const yaw = target.yaw ?? 0;
  const pitch = target.pitch ?? 0;
  const applyPitch = partUsesUpperBodyPitch(part.id);
  const a = bodyLocalPointToWorld(
    target.feetX,
    target.feetY,
    target.feetZ,
    yaw,
    pitch,
    local.ax,
    local.ay,
    local.az,
    applyPitch,
  );
  const b = bodyLocalPointToWorld(
    target.feetX,
    target.feetY,
    target.feetZ,
    yaw,
    pitch,
    local.bx,
    local.by,
    local.bz,
    applyPitch,
  );
  return {
    ax: a.x,
    ay: a.y,
    az: a.z,
    bx: b.x,
    by: b.y,
    bz: b.z,
  };
}
