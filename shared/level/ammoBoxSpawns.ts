import type { Aabb } from './levelData.js';
import {
  AMMO_BOX_HALF_SIZE,
  AMMO_BOX_HEIGHT,
} from './ammoBoxConfig.js';

/** @deprecated Import from ammoBoxConfig.js */
export { AMMO_BOX_HALF_SIZE } from './ammoBoxConfig.js';

/** Extra pickup forgiveness beyond player + crate footprints. */
export const AMMO_BOX_PICKUP_PADDING = 0.35;

export function ammoBoxPickupAabb(boxX: number, boxZ: number): Aabb {
  const half = AMMO_BOX_HALF_SIZE + AMMO_BOX_PICKUP_PADDING;
  return {
    minX: boxX - half,
    maxX: boxX + half,
    minY: 0,
    maxY: AMMO_BOX_HEIGHT,
    minZ: boxZ - half,
    maxZ: boxZ + half,
  };
}

function overlapsPlayerXZ(
  feetX: number,
  feetZ: number,
  playerHalfWidth: number,
  box: Aabb,
): boolean {
  return (
    feetX + playerHalfWidth > box.minX &&
    feetX - playerHalfWidth < box.maxX &&
    feetZ + playerHalfWidth > box.minZ &&
    feetZ - playerHalfWidth < box.maxZ
  );
}

export function overlapsAmmoBox(
  feetX: number,
  feetZ: number,
  boxX: number,
  boxZ: number,
  playerHalfWidth: number,
): boolean {
  return overlapsPlayerXZ(
    feetX,
    feetZ,
    playerHalfWidth,
    ammoBoxPickupAabb(boxX, boxZ),
  );
}

/** Catches fast movement that skips a point-in-time overlap test. */
export function sweptOverlapsAmmoBox(
  prevFeetX: number,
  prevFeetZ: number,
  feetX: number,
  feetZ: number,
  boxX: number,
  boxZ: number,
  playerHalfWidth: number,
): boolean {
  if (overlapsAmmoBox(feetX, feetZ, boxX, boxZ, playerHalfWidth)) return true;
  if (overlapsAmmoBox(prevFeetX, prevFeetZ, boxX, boxZ, playerHalfWidth)) {
    return true;
  }

  const dx = feetX - prevFeetX;
  const dz = feetZ - prevFeetZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return false;

  const step = Math.max(AMMO_BOX_HALF_SIZE * 0.35, 0.08);
  const steps = Math.ceil(dist / step);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (
      overlapsAmmoBox(
        prevFeetX + dx * t,
        prevFeetZ + dz * t,
        boxX,
        boxZ,
        playerHalfWidth,
      )
    ) {
      return true;
    }
  }

  return false;
}
