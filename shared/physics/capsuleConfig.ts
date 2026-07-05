import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../level/levelData.js';

/** Slightly narrower than hitbox — smoother movement through doorways and mesh edges. */
export const CAPSULE_RADIUS = PLAYER_HALF_WIDTH - 0.02;

/** Half-height of the cylindrical section (excluding end caps). */
export const CAPSULE_HALF_HEIGHT = Math.max(
  0.1,
  (PLAYER_HEIGHT - CAPSULE_RADIUS * 2) / 2,
);

/** World-space Y of capsule center from feet position. */
export function feetToCapsuleCenterY(feetY: number): number {
  return feetY + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
}

export function capsuleCenterYToFeet(centerY: number): number {
  return centerY - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS;
}
