import type { Aabb } from './levelData.js';

/** Visual radius of the shield charge pickup mesh. */
export const SHIELD_CHARGE_HALF_SIZE = 0.22;
/** Extra pickup forgiveness beyond player + pickup footprints. */
export const SHIELD_CHARGE_PICKUP_PADDING = 0.3;

export function shieldChargePickupAabb(chargeX: number, chargeZ: number): Aabb {
  const half = SHIELD_CHARGE_HALF_SIZE + SHIELD_CHARGE_PICKUP_PADDING;
  return {
    minX: chargeX - half,
    maxX: chargeX + half,
    minY: 0,
    maxY: 1.1,
    minZ: chargeZ - half,
    maxZ: chargeZ + half,
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

export function overlapsShieldCharge(
  feetX: number,
  feetZ: number,
  chargeX: number,
  chargeZ: number,
  playerHalfWidth: number,
): boolean {
  return overlapsPlayerXZ(
    feetX,
    feetZ,
    playerHalfWidth,
    shieldChargePickupAabb(chargeX, chargeZ),
  );
}

export function sweptOverlapsShieldCharge(
  prevFeetX: number,
  prevFeetZ: number,
  feetX: number,
  feetZ: number,
  chargeX: number,
  chargeZ: number,
  playerHalfWidth: number,
): boolean {
  if (overlapsShieldCharge(feetX, feetZ, chargeX, chargeZ, playerHalfWidth)) {
    return true;
  }
  if (overlapsShieldCharge(prevFeetX, prevFeetZ, chargeX, chargeZ, playerHalfWidth)) {
    return true;
  }

  const dx = feetX - prevFeetX;
  const dz = feetZ - prevFeetZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return false;

  const step = Math.max(SHIELD_CHARGE_HALF_SIZE * 0.35, 0.08);
  const steps = Math.ceil(dist / step);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (
      overlapsShieldCharge(
        prevFeetX + dx * t,
        prevFeetZ + dz * t,
        chargeX,
        chargeZ,
        playerHalfWidth,
      )
    ) {
      return true;
    }
  }

  return false;
}
