import type { Aabb } from './levelData.js';
import {
  AMMO_BOX_HALF_SIZE,
  AMMO_BOX_HEIGHT,
} from './ammoBoxConfig.js';
import { COLUMN_POSITIONS, MAP_HALF } from './kiloSectorColliders.js';

/** @deprecated Import from ammoBoxConfig.js */
export { AMMO_BOX_HALF_SIZE } from './ammoBoxConfig.js';

/** Extra pickup forgiveness beyond player + crate footprints. */
export const AMMO_BOX_PICKUP_PADDING = 0.35;

const COLUMN_CLEARANCE = 2.5;
const MAP_EDGE_INSET = 6;
const MIN_SPACING = 4;
const PICKUP_COUNT = 18;
const SEED = 0x4d4d4f;

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

function generateAmmoBoxPositions(): { x: number; z: number }[] {
  const rng = { s: SEED };
  const positions: { x: number; z: number }[] = [];
  let attempts = 0;

  while (positions.length < PICKUP_COUNT && attempts < 500) {
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

export const AMMO_BOX_POSITIONS = generateAmmoBoxPositions();

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
