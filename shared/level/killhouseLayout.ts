/** Chrono-Bowl 2v2 layout — houses, interior cover, pink props (top-down concept art). */

export interface LayoutPropPlacement {
  x: number;
  z: number;
  rotationY: number;
}

export interface KillhouseHousePlacement extends LayoutPropPlacement {
  id: string;
}

export const KILLHOUSE_LAYOUT_HOUSE_SCALE = 0.045;
export const KILLHOUSE_LAYOUT_HOUSE_VISUAL_MODEL = 'house_flat.fbx';
export const KILLHOUSE_LAYOUT_HOUSE_COLLISION_MODEL = 'lod_house_flat.fbx';
export const KILLHOUSE_LAYOUT_HOUSE_VISUAL_LOD = 0;
export const KILLHOUSE_LAYOUT_HOUSE_COLLISION_LOD = 0;

/** Blue (SW) + red (east) enterable buildings. */
export const KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS: readonly KillhouseHousePlacement[] = [
  { id: 'blue', x: -10.5, z: 10, rotationY: 0 },
  { id: 'red', x: 10.5, z: 0.5, rotationY: Math.PI },
] as const;

export const KILLHOUSE_LAYOUT_MEDIUM_WALL_SCALE = 0.02;
export const KILLHOUSE_LAYOUT_MEDIUM_WALL_MODEL = 'bio_wall_medium.fbx';

/** Interior bio_wall_medium cover — matches concept map wall segments. */
export const KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS: readonly LayoutPropPlacement[] = [
  // Top-left L (B1 lane)
  { x: -17.1, z: -13.5, rotationY: 0 },
  { x: -13.3, z: -13.5, rotationY: 0 },
  { x: -18.5, z: -11.5, rotationY: Math.PI / 2 },
  { x: -18.5, z: -7.7, rotationY: Math.PI / 2 },

  // Top-center lane divider
  { x: -1.9, z: -14.2, rotationY: 0 },
  { x: 1.9, z: -14.2, rotationY: 0 },

  // Top-right T (R1 approach)
  { x: 13.3, z: -13.5, rotationY: 0 },
  { x: 17.1, z: -13.5, rotationY: 0 },
  { x: 15.2, z: -15.3, rotationY: Math.PI / 2 },
  { x: 15.2, z: -11.5, rotationY: Math.PI / 2 },

  // Center-left L (B2)
  { x: -8.7, z: -2.5, rotationY: Math.PI / 2 },
  { x: -8.7, z: 1.3, rotationY: Math.PI / 2 },
  { x: -10.5, z: -0.6, rotationY: 0 },

  // Center-right L (R3)
  { x: 9.5, z: 1.3, rotationY: Math.PI / 2 },
  { x: 9.5, z: -2.5, rotationY: Math.PI / 2 },
  { x: 7.7, z: -0.6, rotationY: 0 },

  // Bottom-right (R6)
  { x: 15.2, z: 14.3, rotationY: 0 },
  { x: 19.0, z: 14.3, rotationY: 0 },
] as const;

export const KILLHOUSE_LAYOUT_PINK_PROP_SCALE = 0.018;
export const KILLHOUSE_LAYOUT_PINK_PROP_VISUAL_MODEL = 'shield_pink_prop_1.fbx';
export const KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_MODEL = 'lod_shield_prop.fbx';
export const KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_LOD = 1;

const CARDINAL_0 = 0;
const CARDINAL_90 = Math.PI / 2;
const CARDINAL_180 = Math.PI;
const CARDINAL_270 = -Math.PI / 2;

/** Corners + center open areas — cardinal rotations only (90° steps). */
export const KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS: readonly LayoutPropPlacement[] = [
  // Map corners
  { x: -17.5, z: -13.5, rotationY: CARDINAL_0 },
  { x: 17.5, z: -13.5, rotationY: CARDINAL_90 },
  { x: -17.5, z: 13.5, rotationY: CARDINAL_180 },
  { x: 17.5, z: 13.5, rotationY: CARDINAL_270 },

  // Center cross — evenly spaced in open lanes
  { x: 0, z: -9, rotationY: CARDINAL_0 },
  { x: 0, z: 9, rotationY: CARDINAL_180 },
  { x: -6.5, z: 0, rotationY: CARDINAL_90 },
  { x: 6.5, z: 0, rotationY: CARDINAL_270 },
] as const;
