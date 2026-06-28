import type { Aabb } from './levelData.js';
import { COLUMN_POSITIONS, MAP_HALF } from './kiloSectorColliders.js';

/** Visual radius of the shield charge pickup mesh. */
export const SHIELD_CHARGE_HALF_SIZE = 0.22;
/** Extra pickup forgiveness beyond player + pickup footprints. */
export const SHIELD_CHARGE_PICKUP_PADDING = 0.3;

const COLUMN_CLEARANCE = 2.75;
const MAP_EDGE_INSET = 8;
const MIN_SPACING = 5;
const PICKUP_COUNT = 12;
const SEED = 0x534844; // "SHD"

function seededRandom(state: { s: number }): number {
  state.s = (state.s * 1664525 + 1013904223) >>> 0;
  return state.s / 0x100000000;
}

function isClear(x: number, z: number): boolean {
  const inner = MAP_HALF - MAP_EDGE_INSET;
  if (Math.abs(x) > inner || Math.abs(z) > inner) return false;

  for (const col of COLUMN_POSITIONS) {
    if (
      Math.abs(x - col.x) < COLUMN_CLEARANCE &&
      Math.abs(z - col.z) < COLUMN_CLEARANCE
    ) {
      return false;
    }
  }

  return true;
}

function generateShieldChargePositions(): { x: number; z: number }[] {
  const rng = { s: SEED };
  const positions: { x: number; z: number }[] = [];
  let attempts = 0;

  while (positions.length < PICKUP_COUNT && attempts < 600) {
    attempts += 1;
    const inner = MAP_HALF - MAP_EDGE_INSET;
    const x = (seededRandom(rng) * 2 - 1) * inner;
    const z = (seededRandom(rng) * 2 - 1) * inner;
    if (!isClear(x, z)) continue;

    const tooClose = positions.some((p) => {
      const dx = p.x - x;
      const dz = p.z - z;
      return dx * dx + dz * dz < MIN_SPACING * MIN_SPACING;
    });
    if (tooClose) continue;

    positions.push({ x, z });
  }

  return positions;
}

export const SHIELD_CHARGE_POSITIONS = generateShieldChargePositions();

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
