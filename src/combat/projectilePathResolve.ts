import type { Vector3 } from 'three';
import * as THREE from 'three';
import type { BodyPartId } from '../../shared/combat/bodyParts';
import { raycastPlayerBodyPart } from '../../shared/combat/playerHitbox';
import { getWeaponMaxHitDistance } from '../../shared/content/weaponStats';
import type { WeaponId } from '../../shared/content/weaponIds';
import type { ShieldDomeManager } from './ShieldDomeManager';
import type { ProjectileHitTarget } from './ProjectileManager';
import { raycastLevelBullets } from './levelBulletRaycast';
import {
  MISS_TRACER_MAX_FLIGHT_SEC,
  PROJECTILE_RAY_SKIN,
  RESOLVE_RAYCAST_MAX_DISTANCE,
} from './projectileConfig';

export type ResolvedHitKind = 'miss' | 'world' | 'shield' | 'player';

export interface ResolvedProjectilePath {
  hitDistance: number;
  hitKind: ResolvedHitKind;
  readonly hitPoint: THREE.Vector3;
  /** Surface normal at the impact — only set for 'world' hits (decals). */
  hitNormal?: THREE.Vector3;
  playerSessionId?: string;
  bodyPart?: BodyPartId;
}

const _segmentEnd = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();
const _playerHitPoint = new THREE.Vector3();

/** AABB fallback rays carry no normal — face the decal back at the shooter. */
function readHitNormal(
  hit: { nx?: number; ny?: number; nz?: number },
  dx: number,
  dy: number,
  dz: number,
): THREE.Vector3 {
  if (hit.nx !== undefined && hit.ny !== undefined && hit.nz !== undefined) {
    _hitNormal.set(hit.nx, hit.ny, hit.nz);
  } else {
    _hitNormal.set(-dx, -dy, -dz);
  }
  if (_hitNormal.lengthSq() < 1e-8) _hitNormal.set(0, 1, 0);
  return _hitNormal.normalize().clone();
}

const MIN_VISUAL_TRACER_DISTANCE = PROJECTILE_RAY_SKIN * 2;

export function resolveProjectilePath(
  aimOrigin: Vector3,
  aimDir: Vector3,
  projectileSpeed: number,
  options: {
    canHitPlayers: boolean;
    visualOnly: boolean;
    weaponId?: WeaponId;
    ownerSessionId: string;
    /** Optional Armory-upgraded range override for this shot. */
    maxHitDistance?: number;
  },
  hitTargets: readonly ProjectileHitTarget[] | null,
  shieldDomeManager: ShieldDomeManager | null,
  worldTime: number,
): ResolvedProjectilePath {
  const ox = aimOrigin.x;
  const oy = aimOrigin.y;
  const oz = aimOrigin.z;
  const dx = aimDir.x;
  const dy = aimDir.y;
  const dz = aimDir.z;

  const weaponMax =
    options.canHitPlayers && !options.visualOnly && options.weaponId
      ? options.maxHitDistance ?? getWeaponMaxHitDistance(options.weaponId)
      : 0;

  const resolveDistance = Math.min(
    RESOLVE_RAYCAST_MAX_DISTANCE,
    weaponMax > 0 ? weaponMax + 20 : RESOLVE_RAYCAST_MAX_DISTANCE,
  );

  const missTracerDistance = projectileSpeed * MISS_TRACER_MAX_FLIGHT_SEC;

  if (options.visualOnly) {
    let hitDistance = missTracerDistance;
    let hitKind: ResolvedHitKind = 'miss';
    let hitNormal: THREE.Vector3 | undefined;
    _hitPoint.set(ox + dx * hitDistance, oy + dy * hitDistance, oz + dz * hitDistance);

    const levelHit = raycastLevelBullets(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      Math.min(resolveDistance, missTracerDistance),
      PROJECTILE_RAY_SKIN,
    );
    if (
      levelHit
      && levelHit.distance > MIN_VISUAL_TRACER_DISTANCE
      && levelHit.distance < hitDistance
    ) {
      hitDistance = levelHit.distance;
      hitKind = 'world';
      _hitPoint.set(levelHit.x, levelHit.y, levelHit.z);
      hitNormal = readHitNormal(levelHit, dx, dy, dz);
    }

    if (shieldDomeManager && shieldDomeManager.hasAnyActiveDome(worldTime)) {
      _segmentEnd.set(ox + dx * hitDistance, oy + dy * hitDistance, oz + dz * hitDistance);
      const shieldPoint = shieldDomeManager.testProjectileSegment(
        aimOrigin,
        _segmentEnd,
        options.ownerSessionId,
        worldTime,
      );
      if (shieldPoint) {
        const shieldDist =
          (shieldPoint.x - ox) * dx
          + (shieldPoint.y - oy) * dy
          + (shieldPoint.z - oz) * dz;
        if (shieldDist > MIN_VISUAL_TRACER_DISTANCE && shieldDist < hitDistance) {
          hitDistance = shieldDist;
          hitKind = 'shield';
          hitNormal = undefined;
          _hitPoint.copy(shieldPoint);
        }
      }
    }

    return {
      hitDistance,
      hitKind,
      hitPoint: _hitPoint.clone(),
      hitNormal,
    };
  }

  let bestDist = resolveDistance;
  let bestKind: ResolvedHitKind = 'miss';
  let bestNormal: THREE.Vector3 | undefined;
  _hitPoint.set(ox + dx * bestDist, oy + dy * bestDist, oz + dz * bestDist);

  const levelHit = raycastLevelBullets(
    ox,
    oy,
    oz,
    dx,
    dy,
    dz,
    resolveDistance,
    PROJECTILE_RAY_SKIN,
  );
  if (levelHit && levelHit.distance < bestDist) {
    bestDist = levelHit.distance;
    bestKind = 'world';
    _hitPoint.set(levelHit.x, levelHit.y, levelHit.z);
    bestNormal = readHitNormal(levelHit, dx, dy, dz);
  }

  if (shieldDomeManager && shieldDomeManager.hasAnyActiveDome(worldTime)) {
    _segmentEnd.set(ox + dx * bestDist, oy + dy * bestDist, oz + dz * bestDist);
    const shieldPoint = shieldDomeManager.testProjectileSegment(
      aimOrigin,
      _segmentEnd,
      options.ownerSessionId,
      worldTime,
    );
    if (shieldPoint) {
      const shieldDist =
        (shieldPoint.x - ox) * dx
        + (shieldPoint.y - oy) * dy
        + (shieldPoint.z - oz) * dz;
      if (shieldDist > 0 && shieldDist < bestDist) {
        bestDist = shieldDist;
        bestKind = 'shield';
        bestNormal = undefined;
        _hitPoint.copy(shieldPoint);
      }
    }
  }

  if (weaponMax > 1e-6 && hitTargets && hitTargets.length > 0) {
    const playerMax = Math.min(weaponMax, bestDist);
    const playerHit = findClosestPlayerHit(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      playerMax,
      hitTargets,
      options.ownerSessionId,
    );
    if (playerHit && playerHit.distance < bestDist) {
      return {
        hitDistance: playerHit.distance,
        hitKind: 'player',
        hitPoint: playerHit.point.clone(),
        playerSessionId: playerHit.sessionId,
        bodyPart: playerHit.bodyPart,
      };
    }
  }

  if (bestKind === 'miss') {
    bestDist = Math.min(bestDist, missTracerDistance);
    _hitPoint.set(ox + dx * bestDist, oy + dy * bestDist, oz + dz * bestDist);
  }

  return {
    hitDistance: bestDist,
    hitKind: bestKind,
    hitPoint: _hitPoint.clone(),
    hitNormal: bestNormal,
  };
}

function findClosestPlayerHit(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  hitTargets: readonly ProjectileHitTarget[],
  ownerSessionId: string,
): {
  sessionId: string;
  bodyPart: BodyPartId;
  distance: number;
  point: THREE.Vector3;
} | null {
  let bestSessionId: string | null = null;
  let bestPart: BodyPartId | null = null;
  let bestDist = Infinity;

  for (const target of hitTargets) {
    if (ownerSessionId && target.sessionId === ownerSessionId) continue;

    const bodyHit = raycastPlayerBodyPart(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      maxDist,
      target,
    );
    if (!bodyHit || bodyHit.distance >= bestDist) continue;

    bestDist = bodyHit.distance;
    bestSessionId = target.sessionId;
    bestPart = bodyHit.part;
  }

  if (!bestSessionId || !bestPart) return null;

  _playerHitPoint.set(
    ox + dx * bestDist,
    oy + dy * bestDist,
    oz + dz * bestDist,
  );

  return {
    sessionId: bestSessionId,
    bodyPart: bestPart,
    distance: bestDist,
    point: _playerHitPoint,
  };
}
