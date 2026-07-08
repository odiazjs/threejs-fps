import { GRENADE_BLAST_RADIUS, GRENADE_COLLISION_RADIUS } from '../throwables/grenadeConfig.js';
import { SHIELD_DOME_RADIUS } from './shieldDomeAbility.js';
import { segmentHitsUpperHemisphere } from './shieldDomeCollision.js';

export interface GrenadeShieldDome {
  centerX: number;
  centerY: number;
  centerZ: number;
  endAt: number;
}

const DOME_COLLISION_RADIUS = SHIELD_DOME_RADIUS + GRENADE_COLLISION_RADIUS;

export interface GrenadeDomeSegmentHit {
  distance: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Closest upper-hemisphere hit along a grenade motion segment. */
export function testGrenadeSegmentAgainstShieldDomes(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  domes: readonly GrenadeShieldDome[],
  worldTime: number,
): GrenadeDomeSegmentHit | null {
  let best: GrenadeDomeSegmentHit | null = null;

  for (const dome of domes) {
    if (dome.endAt <= worldTime) continue;

    const hit = segmentHitsUpperHemisphere(
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      dome.centerX,
      dome.centerY,
      dome.centerZ,
      DOME_COLLISION_RADIUS,
    );
    if (!hit) continue;

    const dx = hit.x - ax;
    const dy = hit.y - ay;
    const dz = hit.z - az;
    const distance = Math.hypot(dx, dy, dz);
    if (best && distance >= best.distance) continue;

    const nx = hit.x - dome.centerX;
    const ny = hit.y - dome.centerY;
    const nz = hit.z - dome.centerZ;
    const len = Math.hypot(nx, ny, nz) || 1;
    best = {
      distance,
      nx: nx / len,
      ny: ny / len,
      nz: nz / len,
    };
  }

  return best;
}

/** True when a grenade blast overlaps an active shield dome shell. */
export function grenadeExplosionHitsShieldDome(
  blastX: number,
  blastY: number,
  blastZ: number,
  dome: GrenadeShieldDome,
  worldTime: number,
): boolean {
  if (dome.endAt <= worldTime) return false;

  const dx = blastX - dome.centerX;
  const dy = blastY - dome.centerY;
  const dz = blastZ - dome.centerZ;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > SHIELD_DOME_RADIUS + GRENADE_BLAST_RADIUS) return false;

  // Blast must reach the upper hemisphere (flat penalty regardless of distance inside).
  return blastY + GRENADE_BLAST_RADIUS >= dome.centerY;
}

/** True when a blast→target line is clipped by any active dome. */
export function grenadeBlastBlockedByShieldDome(
  blastX: number,
  blastY: number,
  blastZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  domes: readonly GrenadeShieldDome[],
  worldTime: number,
): boolean {
  for (const dome of domes) {
    if (dome.endAt <= worldTime) continue;

    const hit = segmentHitsUpperHemisphere(
      blastX,
      blastY,
      blastZ,
      targetX,
      targetY,
      targetZ,
      dome.centerX,
      dome.centerY,
      dome.centerZ,
      SHIELD_DOME_RADIUS,
    );
    if (hit) return true;
  }

  return false;
}
