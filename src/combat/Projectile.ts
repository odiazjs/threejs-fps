import * as THREE from 'three';
import { raycastLevelBullets } from './levelBulletRaycast';
import { PROJECTILE_MAX_AGE } from './projectileConfig';
import { ProjectileBoltVisual } from './ProjectileBoltVisual';

const _segStart = new THREE.Vector3();
const _segEnd = new THREE.Vector3();
const _posePos = new THREE.Vector3();

export type ProjectileHit = {
  point: THREE.Vector3;
};

export type ProjectileUpdateResult =
  | { alive: true }
  | { alive: false; hit?: ProjectileHit };

export type ProjectileLevelHit = {
  x: number;
  y: number;
  z: number;
  distance: number;
};

/**
 * Resolve gameplay hits along the frame travel segment (players, shields, etc.).
 * Return a world hit point to stop the projectile, or null to use level geometry.
 */
export type ProjectileSegmentProbe = (
  from: THREE.Vector3,
  to: THREE.Vector3,
  levelHit: ProjectileLevelHit | null,
) => THREE.Vector3 | null;

export interface ProjectileSpawnParams {
  /** World ray used for hit tests — matches crosshair aim. */
  hitRayOrigin: THREE.Vector3;
  hitRayDirection: THREE.Vector3;
  /** Muzzle / spawn point for the visible bolt. */
  visualOrigin: THREE.Vector3;
  speed: number;
}

export interface ProjectileVisualOptions {
  colors?: readonly [number, number, number];
}

export class Projectile {
  readonly object = new THREE.Group();

  private readonly bolt: ProjectileBoltVisual;
  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly speed: number;
  private distanceAlongRay = 0;
  private age = 0;

  constructor(params: ProjectileSpawnParams, visualOptions: ProjectileVisualOptions = {}) {
    this.aimOrigin.copy(params.hitRayOrigin);
    this.aimDir.copy(params.hitRayDirection);
    this.speed = params.speed;
    this.distanceAlongRay = 0;

    this.bolt = new ProjectileBoltVisual({ colors: visualOptions.colors });
    this.object.add(this.bolt.object);
    this.bolt.setPose(params.visualOrigin, this.aimDir);
  }

  getAimOrigin(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.aimOrigin);
  }

  getAimDirection(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.aimDir);
  }

  update(
    delta: number,
    probe?: ProjectileSegmentProbe,
  ): ProjectileUpdateResult {
    this.age += delta;
    this.bolt.tick(delta);

    if (this.age >= PROJECTILE_MAX_AGE) {
      return { alive: false };
    }

    const step = this.speed * delta;
    if (step <= 1e-8) {
      return { alive: true };
    }

    const segStartDist = this.distanceAlongRay;
    const segEndDist = this.distanceAlongRay + step;

    _segStart.copy(this.aimOrigin).addScaledVector(this.aimDir, segStartDist);
    _segEnd.copy(this.aimOrigin).addScaledVector(this.aimDir, segEndDist);

    const dx = _segEnd.x - _segStart.x;
    const dy = _segEnd.y - _segStart.y;
    const dz = _segEnd.z - _segStart.z;
    const travel = Math.hypot(dx, dy, dz);

    const levelHit = travel > 1e-8
      ? raycastLevelBullets(
        _segStart.x,
        _segStart.y,
        _segStart.z,
        dx / travel,
        dy / travel,
        dz / travel,
        travel,
        0,
      )
      : null;

    const gameplayHit = probe?.(_segStart, _segEnd, levelHit);
    if (gameplayHit) {
      this.distanceAlongRay = segStartDist + this.distanceAlongSegment(
        _segStart,
        dx / travel,
        dy / travel,
        dz / travel,
        gameplayHit,
      );
      this.bolt.setPose(gameplayHit, this.aimDir);
      return { alive: false };
    }

    if (levelHit) {
      this.distanceAlongRay = segStartDist + levelHit.distance;
      _posePos.set(levelHit.x, levelHit.y, levelHit.z);
      this.bolt.setPose(_posePos, this.aimDir);
      return { alive: false, hit: { point: _posePos.clone() } };
    }

    this.distanceAlongRay = segEndDist;
    this.bolt.setPose(_segEnd, this.aimDir);
    return { alive: true };
  }

  private distanceAlongSegment(
    from: THREE.Vector3,
    dirX: number,
    dirY: number,
    dirZ: number,
    point: THREE.Vector3,
  ): number {
    return (
      (point.x - from.x) * dirX
      + (point.y - from.y) * dirY
      + (point.z - from.z) * dirZ
    );
  }

  dispose(): void {
    this.bolt.dispose();
    this.object.removeFromParent();
  }
}
