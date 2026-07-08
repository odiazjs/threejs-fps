import type { PickupAmmoMessage } from './pickup.js';

export type PickupGrenadeMessage = PickupAmmoMessage;

export const GRENADE_PICKUP_HALF_SIZE = 0.38;

export const GRENADE_PICKUP_PADDING = 0.35;

export function grenadePickupAabb(boxX: number, boxZ: number) {
  const half = GRENADE_PICKUP_HALF_SIZE + GRENADE_PICKUP_PADDING;
  return {
    minX: boxX - half,
    maxX: boxX + half,
    minY: 0,
    maxY: 0.55,
    minZ: boxZ - half,
    maxZ: boxZ + half,
  };
}

function overlapsPlayerXZ(
  feetX: number,
  feetZ: number,
  playerHalfWidth: number,
  box: ReturnType<typeof grenadePickupAabb>,
): boolean {
  return (
    feetX + playerHalfWidth > box.minX &&
    feetX - playerHalfWidth < box.maxX &&
    feetZ + playerHalfWidth > box.minZ &&
    feetZ - playerHalfWidth < box.maxZ
  );
}

export function overlapsGrenadePickup(
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
    grenadePickupAabb(boxX, boxZ),
  );
}

export function sweptOverlapsGrenadePickup(
  prevFeetX: number,
  prevFeetZ: number,
  feetX: number,
  feetZ: number,
  boxX: number,
  boxZ: number,
  playerHalfWidth: number,
): boolean {
  if (overlapsGrenadePickup(feetX, feetZ, boxX, boxZ, playerHalfWidth)) return true;
  if (overlapsGrenadePickup(prevFeetX, prevFeetZ, boxX, boxZ, playerHalfWidth)) {
    return true;
  }

  const dx = feetX - prevFeetX;
  const dz = feetZ - prevFeetZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return false;

  const step = Math.max(GRENADE_PICKUP_HALF_SIZE * 0.35, 0.08);
  const steps = Math.ceil(dist / step);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (
      overlapsGrenadePickup(
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
