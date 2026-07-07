import {
  BODY_PARTS,
  bodyLocalPointToWorld,
  getBodyPartDef,
  isValidBodyPartId,
  partBodyLocalCapCenters,
  partSides,
  partUsesUpperBodyPitch,
  type BodyPartId,
} from './bodyParts.js';
import { CHARACTER_HIT_HEIGHT } from './bodyPartPose.js';
import {
  type BodyPartVolume,
} from './bodyPartVolumes.js';

/**
 * Legacy single-capsule dimensions — kept for chest-height FX and spawn margins.
 */
export const PLAYER_HIT_CAPSULE_RADIUS = 0.26;
export const PLAYER_HIT_CAPSULE_HEIGHT = CHARACTER_HIT_HEIGHT;

export interface PlayerHitTarget {
  feetX: number;
  feetY: number;
  feetZ: number;
  yaw?: number;
  pitch?: number;
  /** Bone-driven world-space capsules; preferred over static fallback. */
  volumes?: readonly BodyPartVolume[];
}

export interface BodyPartHitResult {
  part: BodyPartId;
  distance: number;
}

function raycastSphere(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
): number | null {
  const lx = originX - centerX;
  const ly = originY - centerY;
  const lz = originZ - centerZ;
  const a = dirX * dirX + dirY * dirY + dirZ * dirZ;
  const b = 2 * (dirX * lx + dirY * ly + dirZ * lz);
  const c = lx * lx + ly * ly + lz * lz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return null;

  const sqrtDisc = Math.sqrt(disc);
  const inv = 0.5 / a;
  let best: number | null = null;

  for (const t of [(-b - sqrtDisc) * inv, (-b + sqrtDisc) * inv]) {
    if (t < 0 || t > maxDist) continue;
    if (best === null || t < best) best = t;
  }

  return best;
}

function distanceSquaredPointToSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-12) {
    return apx * apx + apy * apy + apz * apz;
  }

  const t = Math.max(
    0,
    Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq),
  );
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Ray segment vs capsule along AB with radius r (sphere centers at A and B).
 */
export function raycastCapsuleSegment(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
  allowGrazingFallback = true,
): number | null {
  if (maxDist <= 0) return null;

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const baba = abx * abx + aby * aby + abz * abz;

  // Degenerate capsule — treat as a sphere.
  if (baba < 1e-10) {
    return raycastSphere(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      maxDist,
      ax,
      ay,
      az,
      radius,
    );
  }

  const oax = originX - ax;
  const oay = originY - ay;
  const oaz = originZ - az;
  const bard = abx * dirX + aby * dirY + abz * dirZ;
  const baoa = abx * oax + aby * oay + abz * oaz;
  const rdoa = dirX * oax + dirY * oay + dirZ * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const rSq = radius * radius;

  let best: number | null = null;
  const consider = (t: number) => {
    if (t < 0 || t > maxDist) return;
    if (best === null || t < best) best = t;
  };

  const aa = baba - bard * bard;
  const bb = baba * rdoa - baoa * bard;
  const cc = baba * oaoa - baoa * baoa - rSq * baba;
  const h = bb * bb - aa * cc;
  if (h >= 0 && Math.abs(aa) > 1e-12) {
    const sqrtH = Math.sqrt(h);
    for (const sign of [-1, 1]) {
      const t = (-bb + sign * sqrtH) / aa;
      const along = baoa + t * bard;
      if (along >= 0 && along <= baba) consider(t);
    }
  }

  const hitA = raycastSphere(
    originX,
    originY,
    originZ,
    dirX,
    dirY,
    dirZ,
    maxDist,
    ax,
    ay,
    az,
    radius,
  );
  if (hitA !== null) consider(hitA);

  const hitB = raycastSphere(
    originX,
    originY,
    originZ,
    dirX,
    dirY,
    dirZ,
    maxDist,
    bx,
    by,
    bz,
    radius,
  );
  if (hitB !== null) consider(hitB);

  if (best !== null) return best;

  if (!allowGrazingFallback) return null;

  // Forward scan fallback for grazing hits on thin limb capsules.
  const steps = Math.min(24, Math.max(8, Math.ceil(maxDist / 0.25)));
  const radiusSq = radius * radius;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxDist;
    const px = originX + dirX * t;
    const py = originY + dirY * t;
    const pz = originZ + dirZ * t;
    if (distanceSquaredPointToSegment(px, py, pz, ax, ay, az, bx, by, bz) <= radiusSq) {
      return t;
    }
  }

  return null;
}

function buildStaticBodyPartVolumes(
  target: {
    feetX: number;
    feetY: number;
    feetZ: number;
    yaw?: number;
    pitch?: number;
  },
): BodyPartVolume[] {
  const volumes: BodyPartVolume[] = [];

  for (const part of BODY_PARTS) {
    for (const side of partSides(part)) {
      const local = partBodyLocalCapCenters(part, side);
      const applyPitch = partUsesUpperBodyPitch(part.id);
      const yaw = target.yaw ?? 0;
      const pitch = target.pitch ?? 0;

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

      volumes.push({
        part: part.id,
        ax: a.x,
        ay: a.y,
        az: a.z,
        bx: b.x,
        by: b.y,
        bz: b.z,
        radius: part.radius,
      });
    }
  }

  return volumes;
}

function resolveBodyPartVolumes(
  target: {
    feetX: number;
    feetY: number;
    feetZ: number;
    yaw?: number;
    pitch?: number;
    volumes?: readonly BodyPartVolume[];
  },
): readonly BodyPartVolume[] {
  if (target.volumes && target.volumes.length > 0) {
    return target.volumes;
  }
  return buildStaticBodyPartVolumes(target);
}

const PART_HIT_PRIORITY: Record<BodyPartId, number> = {
  head: 0,
  arms: 1,
  legs: 2,
  feet: 3,
  torso: 4,
};

/** When multiple parts hit at similar depth, prefer limbs over torso. */
const CLOSE_HIT_EPS = 0.1;

/** Test ray/segment against an explicit list of body-part capsules. */
export function raycastBodyPartVolumes(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
  volumes: readonly BodyPartVolume[],
  allowGrazingFallback = false,
): BodyPartHitResult | null {
  let bestPart: BodyPartId | null = null;
  let bestDist = Infinity;
  let bestPriority = Infinity;

  for (const vol of volumes) {
    const distance = raycastCapsuleSegment(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      maxDist,
      vol.ax,
      vol.ay,
      vol.az,
      vol.bx,
      vol.by,
      vol.bz,
      vol.radius,
      allowGrazingFallback,
    );
    if (distance === null) continue;

    const priority = PART_HIT_PRIORITY[vol.part];
    if (distance < bestDist - CLOSE_HIT_EPS) {
      bestDist = distance;
      bestPart = vol.part;
      bestPriority = priority;
      continue;
    }

    if (distance <= bestDist + CLOSE_HIT_EPS) {
      if (priority < bestPriority || (priority === bestPriority && distance < bestDist)) {
        bestDist = distance;
        bestPart = vol.part;
        bestPriority = priority;
      }
    }
  }

  if (bestPart === null) return null;
  return { part: bestPart, distance: bestDist };
}

/** Returns the closest struck body part along the ray/segment, if any. */
export function raycastPlayerBodyPart(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
  target: PlayerHitTarget,
): BodyPartHitResult | null {
  const volumes = resolveBodyPartVolumes(target);
  return raycastBodyPartVolumes(
    originX,
    originY,
    originZ,
    dirX,
    dirY,
    dirZ,
    maxDist,
    volumes,
  );
}

/** Resolve which body part contains a world-space point (melee / splash). */
export function resolveBodyPartFromWorldPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  target: PlayerHitTarget,
): BodyPartId {
  const volumes = resolveBodyPartVolumes(target);
  let bestPart: BodyPartId = 'torso';
  let bestPriority = PART_HIT_PRIORITY.torso;
  let bestDistSq = Infinity;

  for (const vol of volumes) {
    const distSq = distanceSquaredPointToSegment(
      worldX,
      worldY,
      worldZ,
      vol.ax,
      vol.ay,
      vol.az,
      vol.bx,
      vol.by,
      vol.bz,
    );
    const radiusSq = vol.radius * vol.radius;
    if (distSq > radiusSq * 1.2) continue;

    const priority = PART_HIT_PRIORITY[vol.part];
    if (priority < bestPriority || (priority === bestPriority && distSq < bestDistSq)) {
      bestPriority = priority;
      bestDistSq = distSq;
      bestPart = vol.part;
    }
  }

  return bestPart;
}

/** Ray segment vs full player body (any part). */
export function rayHitsPlayer(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  distance: number,
  target: PlayerHitTarget,
): boolean {
  return raycastPlayerBodyPart(
    originX,
    originY,
    originZ,
    dirX,
    dirY,
    dirZ,
    distance,
    target,
  ) !== null;
}

export function rayHitsVerticalCapsule(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
  feetX: number,
  feetY: number,
  feetZ: number,
  radius = PLAYER_HIT_CAPSULE_RADIUS,
  totalHeight = PLAYER_HIT_CAPSULE_HEIGHT,
): boolean {
  const y0 = feetY + radius;
  const y1 = feetY + totalHeight - radius;
  return (
    raycastCapsuleSegment(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      maxDist,
      feetX,
      y0,
      feetZ,
      feetX,
      y1,
      feetZ,
      radius,
    ) !== null
  );
}

export function scaleDamageForBodyPart(baseDamage: number, partId: BodyPartId): number {
  return Math.max(1, Math.round(baseDamage * getBodyPartDef(partId).damageMultiplier));
}

export { isValidBodyPartId, type BodyPartId };
export type { BodyPartVolume };
