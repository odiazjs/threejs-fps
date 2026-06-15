export const BOX_PLACEMENTS = [[5, -10], [-8, -5], [0, -15], [12, 5]] as const;

export const BOX_SIZE = {
  width: 2,
  height: 4,
  depth: 2,
} as const;

export const BOX_CENTER_Y = BOX_SIZE.height / 2;

export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.6;
export const EYE_HEIGHT = 1.6;
