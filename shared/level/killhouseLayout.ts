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

/** West / east enterable buildings — mid-lane, away from corner team spawns. */
export const KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS: readonly KillhouseHousePlacement[] = [
  { id: 'blue', x: -7.5, z: -3, rotationY: 0 },
  { id: 'red', x: 7.5, z: 3, rotationY: Math.PI },
] as const;

export const KILLHOUSE_LAYOUT_MEDIUM_WALL_SCALE = 0.02;
export const KILLHOUSE_LAYOUT_MEDIUM_WALL_MODEL = 'bio_wall_medium.fbx';

/** Interior bio_wall_medium cover — center lanes only (corners kept clear for TDM spawns). */
export const KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS: readonly LayoutPropPlacement[] = [
  // North center lane split
  { x: -1.9, z: -10, rotationY: 0 },
  { x: 1.9, z: -10, rotationY: 0 },

  // West mid cover
  { x: -5.5, z: -1, rotationY: Math.PI / 2 },
  { x: -5.5, z: 2.5, rotationY: Math.PI / 2 },

  // East mid cover
  { x: 5.5, z: 2.5, rotationY: Math.PI / 2 },
  { x: 5.5, z: -1, rotationY: Math.PI / 2 },
] as const;

export const KILLHOUSE_LAYOUT_PINK_PROP_SCALE = 0.018;
export const KILLHOUSE_LAYOUT_PINK_PROP_VISUAL_MODEL = 'shield_pink_prop_1.fbx';
export const KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_MODEL = 'lod_shield_prop.fbx';
export const KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_LOD = 1;

const CARDINAL_0 = 0;
const CARDINAL_90 = Math.PI / 2;
const CARDINAL_180 = Math.PI;
const CARDINAL_270 = -Math.PI / 2;

/** Center open areas only — corner props removed (blocked spawns). */
export const KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS: readonly LayoutPropPlacement[] = [
  { x: 0, z: -9, rotationY: CARDINAL_0 },
  { x: 0, z: 9, rotationY: CARDINAL_180 },
  { x: -6.5, z: 0, rotationY: CARDINAL_90 },
  { x: 6.5, z: 0, rotationY: CARDINAL_270 },
] as const;
