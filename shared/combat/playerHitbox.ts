/**
 * Vertical capsule hit volume — same cross-section from every yaw angle, unlike
 * world-axis mesh AABBs that balloon when a posed character rotates.
 *
 * Sized to match the fitted character mesh (~1.65 m), not the movement box.
 */
export const PLAYER_HIT_CAPSULE_RADIUS = 0.26;
export const PLAYER_HIT_CAPSULE_HEIGHT = 1.62;

export interface PlayerHitTarget {
  feetX: number;
  feetY: number;
  feetZ: number;
}

function intervalsOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): boolean {
  return Math.min(aMax, bMax) >= Math.max(aMin, bMin);
}

/** Ray segment t in [0, maxDist] where Y lies in [yMin, yMax]. */
function rayYInterval(
  originY: number,
  dirY: number,
  maxDist: number,
  yMin: number,
  yMax: number,
): [number, number] | null {
  if (Math.abs(dirY) < 1e-12) {
    return originY >= yMin && originY <= yMax ? [0, maxDist] : null;
  }

  const tEnter = (yMin - originY) / dirY;
  const tExit = (yMax - originY) / dirY;
  const tMin = Math.max(Math.min(tEnter, tExit), 0);
  const tMax = Math.min(Math.max(tEnter, tExit), maxDist);
  return tMax >= tMin ? [tMin, tMax] : null;
}

function rayHitsSphereSegment(
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
  minHitY: number,
  maxHitY: number,
): boolean {
  const lx = originX - centerX;
  const ly = originY - centerY;
  const lz = originZ - centerZ;
  const b = 2 * (dirX * lx + dirY * ly + dirZ * lz);
  const c = lx * lx + ly * ly + lz * lz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return false;

  const sqrtDisc = Math.sqrt(disc);
  const t0 = (-b - sqrtDisc) * 0.5;
  const t1 = (-b + sqrtDisc) * 0.5;

  for (const t of [t0, t1]) {
    if (t < 0 || t > maxDist) continue;
    const hitY = originY + t * dirY;
    if (hitY >= minHitY && hitY <= maxHitY) return true;
  }

  return false;
}

/** Ray segment vs the cylindrical body of a vertical capsule. */
function rayHitsVerticalCapsuleCylinder(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
  centerX: number,
  centerY0: number,
  centerY1: number,
  centerZ: number,
  radius: number,
): boolean {
  const yInterval = rayYInterval(originY, dirY, maxDist, centerY0, centerY1);
  if (!yInterval) return false;

  const lx = originX - centerX;
  const lz = originZ - centerZ;
  const radiusSq = radius * radius;
  const insideAtStart = lx * lx + lz * lz <= radiusSq;
  const horizontalLenSq = dirX * dirX + dirZ * dirZ;

  if (horizontalLenSq < 1e-12) {
    return insideAtStart && intervalsOverlap(0, maxDist, yInterval[0], yInterval[1]);
  }

  const a = horizontalLenSq;
  const b = 2 * (lx * dirX + lz * dirZ);
  const c = lx * lx + lz * lz - radiusSq;
  const disc = b * b - 4 * a * c;

  if (disc < 0) {
    if (!insideAtStart) return false;
    return intervalsOverlap(0, maxDist, yInterval[0], yInterval[1]);
  }

  const sqrtDisc = Math.sqrt(disc);
  const inv2a = 0.5 / a;
  let tHorizMin = (-b - sqrtDisc) * inv2a;
  let tHorizMax = (-b + sqrtDisc) * inv2a;
  if (tHorizMin > tHorizMax) {
    const swap = tHorizMin;
    tHorizMin = tHorizMax;
    tHorizMax = swap;
  }

  if (insideAtStart) {
    tHorizMin = 0;
  }

  tHorizMin = Math.max(tHorizMin, 0);
  tHorizMax = Math.min(tHorizMax, maxDist);
  if (tHorizMax < tHorizMin) return false;

  return intervalsOverlap(tHorizMin, tHorizMax, yInterval[0], yInterval[1]);
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
  const topY = feetY + totalHeight;

  if (
    rayHitsVerticalCapsuleCylinder(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      maxDist,
      feetX,
      y0,
      y1,
      feetZ,
      radius,
    )
  ) {
    return true;
  }

  return (
    rayHitsSphereSegment(
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
      radius,
      feetY,
      y0,
    ) ||
    rayHitsSphereSegment(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      maxDist,
      feetX,
      y1,
      feetZ,
      radius,
      y1,
      topY,
    )
  );
}

/** Ray segment vs player body capsule. */
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
  return rayHitsVerticalCapsule(
    originX,
    originY,
    originZ,
    dirX,
    dirY,
    dirZ,
    distance,
    target.feetX,
    target.feetY,
    target.feetZ,
  );
}
