import {
  BIO_WALL_MODULE_DEPTH,
  BIO_WALL_MODULE_HEIGHT,
  BIO_WALL_MODULE_LENGTH,
  PERIMETER_BIO_WALL_PLACEMENTS,
} from './killhouseSmallColliders.js';
import { BIO_MEDIUM_WALL_SIZE } from './killhouseMazeWalls.js';
import {
  KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS,
  KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS,
  KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS,
} from './killhouseLayout.js';

/** Y-up box with half-extents in local space, rotated around Y at the center. */
export interface OrientedBoxCollider {
  centerX: number;
  centerY: number;
  centerZ: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  rotationY: number;
}

const BASIC_WALL_SIZE = {
  length: BIO_WALL_MODULE_LENGTH,
  depth: BIO_WALL_MODULE_DEPTH,
  height: BIO_WALL_MODULE_HEIGHT,
} as const;

/** Scaled lod_house_flat.fbx bounds (bbox alignment). */
export const KILLHOUSE_HOUSE_COLLISION_SIZE = {
  length: 6.539,
  depth: 8.524,
  height: 4.435,
  wall: 0.35,
  doorWidth: 2.4,
} as const;

/** Scaled lod_shield_prop.fbx bounds (bbox alignment). */
export const KILLHOUSE_PINK_PROP_COLLISION_SIZE = {
  length: 2.878,
  depth: 3.415,
  height: 2.365,
} as const;

function isQuarterTurn(rotationY: number): boolean {
  const turns = Math.round(rotationY / (Math.PI / 2));
  return Math.abs(turns % 2) === 1;
}

function wallBoxFromPlacement(
  x: number,
  z: number,
  rotationY: number,
  size: { length: number; depth: number; height: number },
): OrientedBoxCollider {
  const quarterTurn = isQuarterTurn(rotationY);
  return {
    centerX: x,
    centerY: size.height * 0.5,
    centerZ: z,
    halfX: (quarterTurn ? size.depth : size.length) * 0.5,
    halfY: size.height * 0.5,
    halfZ: (quarterTurn ? size.length : size.depth) * 0.5,
    rotationY,
  };
}

function propBoxFromPlacement(
  x: number,
  z: number,
  rotationY: number,
  size: { length: number; depth: number; height: number },
): OrientedBoxCollider {
  const quarterTurn = isQuarterTurn(rotationY);
  return {
    centerX: x,
    centerY: size.height * 0.5,
    centerZ: z,
    halfX: (quarterTurn ? size.depth : size.length) * 0.5,
    halfY: size.height * 0.5,
    halfZ: (quarterTurn ? size.length : size.depth) * 0.5,
    rotationY,
  };
}

function localBoxToWorld(
  worldX: number,
  worldZ: number,
  rotationY: number,
  lx: number,
  ly: number,
  lz: number,
  hx: number,
  hy: number,
  hz: number,
): OrientedBoxCollider {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return {
    centerX: worldX + lx * cos - lz * sin,
    centerY: ly,
    centerZ: worldZ + lx * sin + lz * cos,
    halfX: hx,
    halfY: hy,
    halfZ: hz,
    rotationY,
  };
}

/** Hollow house shell — door gap on local -Z (front when rotationY = 0). */
function appendHouseShellBoxes(
  boxes: OrientedBoxCollider[],
  worldX: number,
  worldZ: number,
  rotationY: number,
): void {
  const { length: w, depth: d, height: h, wall: t, doorWidth } = KILLHOUSE_HOUSE_COLLISION_SIZE;
  const sideSpan = (w - t) * 0.5;
  const frontSpan = (w - doorWidth) * 0.25;

  boxes.push(
    localBoxToWorld(worldX, worldZ, rotationY, 0, h * 0.5, d * 0.5 - t * 0.5, w * 0.5, h * 0.5, t * 0.5),
    localBoxToWorld(
      worldX,
      worldZ,
      rotationY,
      -doorWidth * 0.5 - frontSpan * 0.5,
      h * 0.5,
      -d * 0.5 + t * 0.5,
      frontSpan * 0.5,
      h * 0.5,
      t * 0.5,
    ),
    localBoxToWorld(
      worldX,
      worldZ,
      rotationY,
      doorWidth * 0.5 + frontSpan * 0.5,
      h * 0.5,
      -d * 0.5 + t * 0.5,
      frontSpan * 0.5,
      h * 0.5,
      t * 0.5,
    ),
    localBoxToWorld(
      worldX,
      worldZ,
      rotationY,
      -w * 0.5 + t * 0.5,
      h * 0.5,
      0,
      t * 0.5,
      h * 0.5,
      sideSpan,
    ),
    localBoxToWorld(
      worldX,
      worldZ,
      rotationY,
      w * 0.5 - t * 0.5,
      h * 0.5,
      0,
      t * 0.5,
      h * 0.5,
      sideSpan,
    ),
  );
}

/** Lightweight server collision — box modules from layout data (no FBX / trimesh). */
export function buildKillhouseServerColliders(): OrientedBoxCollider[] {
  const boxes: OrientedBoxCollider[] = [];

  for (const placement of PERIMETER_BIO_WALL_PLACEMENTS) {
    boxes.push(
      wallBoxFromPlacement(placement.x, placement.z, placement.rotationY, BASIC_WALL_SIZE),
    );
  }

  for (const placement of KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS) {
    boxes.push(
      wallBoxFromPlacement(placement.x, placement.z, placement.rotationY, BIO_MEDIUM_WALL_SIZE),
    );
  }

  for (const placement of KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS) {
    appendHouseShellBoxes(boxes, placement.x, placement.z, placement.rotationY);
  }

  for (const placement of KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS) {
    boxes.push(
      propBoxFromPlacement(
        placement.x,
        placement.z,
        placement.rotationY,
        KILLHOUSE_PINK_PROP_COLLISION_SIZE,
      ),
    );
  }

  return boxes;
}
