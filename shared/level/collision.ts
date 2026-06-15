import {
  BOX_CENTER_Y,
  BOX_PLACEMENTS,
  BOX_SIZE,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
} from './levelData.js';

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const EPS = 1e-4;

export function getLevelColliders(): Aabb[] {
  const halfW = BOX_SIZE.width / 2;
  const halfH = BOX_SIZE.height / 2;
  const halfD = BOX_SIZE.depth / 2;

  return BOX_PLACEMENTS.map(([x, z]) => ({
    minX: x - halfW,
    maxX: x + halfW,
    minY: BOX_CENTER_Y - halfH,
    maxY: BOX_CENTER_Y + halfH,
    minZ: z - halfD,
    maxZ: z + halfD,
  }));
}

function playerAabb(feetX: number, feetY: number, feetZ: number): Aabb {
  return {
    minX: feetX - PLAYER_HALF_WIDTH,
    maxX: feetX + PLAYER_HALF_WIDTH,
    minY: feetY,
    maxY: feetY + PLAYER_HEIGHT,
    minZ: feetZ - PLAYER_HALF_WIDTH,
    maxZ: feetZ + PLAYER_HALF_WIDTH,
  };
}

function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

function resolveAxis(
  feetX: number,
  feetY: number,
  feetZ: number,
  axis: 'x' | 'z',
  delta: number,
  colliders: Aabb[],
): number {
  if (delta === 0) return axis === 'x' ? feetX : feetZ;

  let value = (axis === 'x' ? feetX : feetZ) + delta;

  for (const box of colliders) {
    const player = playerAabb(
      axis === 'x' ? value : feetX,
      feetY,
      axis === 'z' ? value : feetZ,
    );

    if (!overlaps(player, box)) continue;

    value =
      axis === 'x'
        ? delta > 0
          ? box.minX - PLAYER_HALF_WIDTH - EPS
          : box.maxX + PLAYER_HALF_WIDTH + EPS
        : delta > 0
          ? box.minZ - PLAYER_HALF_WIDTH - EPS
          : box.maxZ + PLAYER_HALF_WIDTH + EPS;
  }

  return value;
}

export function movePlayer(
  feetX: number,
  feetY: number,
  feetZ: number,
  deltaX: number,
  deltaZ: number,
): { x: number; y: number; z: number } {
  const colliders = getLevelColliders();
  const x = resolveAxis(feetX, feetY, feetZ, 'x', deltaX, colliders);
  const z = resolveAxis(x, feetY, feetZ, 'z', deltaZ, colliders);

  return { x, y: feetY, z };
}
