export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.6;
export const EYE_HEIGHT = 1.6;

export const GRAVITY = 24;
export const JUMP_VELOCITY = 9;
export const GROUND_SNAP = 0.08;

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Elevated deck — uses platform-specific ground snapping in collision. */
  platform?: boolean;
}
