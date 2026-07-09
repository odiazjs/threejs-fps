import {
  PLAYER_HIT_CAPSULE_HEIGHT,
  PLAYER_HIT_CAPSULE_RADIUS,
  raycastCapsuleSegment,
} from './playerHitbox.js';
import { GRENADE_COLLISION_RADIUS } from '../throwables/grenadeConfig.js';

export interface GrenadePlayerCollider {
  sessionId: string;
  feetX: number;
  feetY: number;
  feetZ: number;
  crouching?: boolean;
}

export interface GrenadePlayerSegmentHit {
  distance: number;
  nx: number;
  ny: number;
  nz: number;
  sessionId: string;
}

const COLLISION_RADIUS = PLAYER_HIT_CAPSULE_RADIUS + GRENADE_COLLISION_RADIUS;

function capsuleHeight(crouching: boolean | undefined): number {
  return crouching ? PLAYER_HIT_CAPSULE_HEIGHT * 0.55 : PLAYER_HIT_CAPSULE_HEIGHT;
}

function capsuleAxis(
  feetX: number,
  feetY: number,
  feetZ: number,
  crouching: boolean | undefined,
): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } {
  const height = capsuleHeight(crouching);
  const radius = PLAYER_HIT_CAPSULE_RADIUS;
  return {
    ax: feetX,
    ay: feetY + radius,
    az: feetZ,
    bx: feetX,
    by: feetY + height - radius,
    bz: feetZ,
  };
}

function closestPointOnSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): { x: number; y: number; z: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-10) {
    return { x: ax, y: ay, z: az };
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
  return {
    x: ax + abx * t,
    y: ay + aby * t,
    z: az + abz * t,
  };
}

function outwardNormal(
  hitX: number,
  hitY: number,
  hitZ: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): { nx: number; ny: number; nz: number } {
  const closest = closestPointOnSegment(hitX, hitY, hitZ, ax, ay, az, bx, by, bz);
  let nx = hitX - closest.x;
  let ny = hitY - closest.y;
  let nz = hitZ - closest.z;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-6) {
    // Degenerate — push horizontally away from capsule center.
    nx = hitX - ax;
    ny = 0;
    nz = hitZ - az;
    const flat = Math.hypot(nx, nz);
    if (flat < 1e-6) {
      return { nx: 0, ny: 1, nz: 0 };
    }
    return { nx: nx / flat, ny: 0, nz: nz / flat };
  }
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

/**
 * Closest player-capsule hit along a grenade motion segment.
 * Capsule radius is expanded by the grenade collision radius.
 */
export function testGrenadeSegmentAgainstPlayers(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  players: readonly GrenadePlayerCollider[],
  options?: {
    ignoreSessionId?: string;
  },
): GrenadePlayerSegmentHit | null {
  const moveX = bx - ax;
  const moveY = by - ay;
  const moveZ = bz - az;
  const moveLen = Math.hypot(moveX, moveY, moveZ);
  if (moveLen < 1e-6 || players.length === 0) return null;

  const inv = 1 / moveLen;
  const dirX = moveX * inv;
  const dirY = moveY * inv;
  const dirZ = moveZ * inv;

  let best: GrenadePlayerSegmentHit | null = null;

  for (const player of players) {
    if (options?.ignoreSessionId && player.sessionId === options.ignoreSessionId) {
      continue;
    }

    const axis = capsuleAxis(player.feetX, player.feetY, player.feetZ, player.crouching);
    const hitDist = raycastCapsuleSegment(
      ax,
      ay,
      az,
      dirX,
      dirY,
      dirZ,
      moveLen,
      axis.ax,
      axis.ay,
      axis.az,
      axis.bx,
      axis.by,
      axis.bz,
      COLLISION_RADIUS,
      false,
    );
    if (hitDist === null) continue;
    if (best && hitDist >= best.distance) continue;

    const hitX = ax + dirX * hitDist;
    const hitY = ay + dirY * hitDist;
    const hitZ = az + dirZ * hitDist;
    const normal = outwardNormal(
      hitX,
      hitY,
      hitZ,
      axis.ax,
      axis.ay,
      axis.az,
      axis.bx,
      axis.by,
      axis.bz,
    );

    best = {
      distance: hitDist,
      nx: normal.nx,
      ny: normal.ny,
      nz: normal.nz,
      sessionId: player.sessionId,
    };
  }

  return best;
}
