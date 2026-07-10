import * as THREE from 'three';
import { PROJECTILE_MAX_AGE } from './projectileConfig';
import {
  ProjectileBoltVisual,
  type ProjectileBoltStyle,
} from './ProjectileBoltVisual';
import type { ResolvedProjectilePath } from './projectilePathResolve';

const _posePos = new THREE.Vector3();
const _visualDir = new THREE.Vector3();

export type ProjectileHit = {
  point: THREE.Vector3;
};

export type ProjectileUpdateResult =
  | { alive: true }
  | { alive: false; hit?: ProjectileHit; resolvedHit?: ResolvedProjectilePath };

export interface ProjectileSpawnParams {
  hitRayOrigin: THREE.Vector3;
  hitRayDirection: THREE.Vector3;
  visualOrigin: THREE.Vector3;
  speed: number;
}

export interface ProjectileVisualOptions {
  colors?: readonly [number, number, number];
  style?: ProjectileBoltStyle;
  /** Visual-only sag (world units / s²). Hits stay on the aim ray. */
  gravity?: number;
}

export class Projectile {
  readonly object = new THREE.Group();

  private readonly bolt: ProjectileBoltVisual;
  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly visualOrigin = new THREE.Vector3();
  private speed = 0;
  private gravity = 0;
  private resolved: ResolvedProjectilePath | null = null;
  private distanceAlongRay = 0;
  private age = 0;

  constructor() {
    this.bolt = new ProjectileBoltVisual();
    this.object.add(this.bolt.object);
  }

  init(
    params: ProjectileSpawnParams,
    resolved: ResolvedProjectilePath,
    visualOptions: ProjectileVisualOptions = {},
  ): void {
    this.aimOrigin.copy(params.hitRayOrigin);
    this.aimDir.copy(params.hitRayDirection);
    this.visualOrigin.copy(params.visualOrigin);
    this.speed = params.speed;
    this.gravity = Math.max(0, visualOptions.gravity ?? 0);
    this.resolved = resolved;
    this.distanceAlongRay = 0;
    this.age = 0;
    this.bolt.configure({
      colors: visualOptions.colors,
      style: visualOptions.style ?? 'bolt',
    });
    this.bolt.setPose(params.visualOrigin, this.aimDir);
  }

  getAimOrigin(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.aimOrigin);
  }

  getAimDirection(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.aimDir);
  }

  update(delta: number): ProjectileUpdateResult {
    this.age += delta;

    const resolved = this.resolved;
    if (!resolved) {
      return { alive: false };
    }

    const step = this.speed * delta;
    if (step <= 1e-8) {
      this.bolt.tick(delta);
      return { alive: true };
    }

    const nextDist = this.distanceAlongRay + step;

    if (nextDist >= resolved.hitDistance) {
      this.distanceAlongRay = resolved.hitDistance;
      this.setBoltPoseAtDistance(this.distanceAlongRay);
      this.bolt.tick(delta);
      return { alive: false, resolvedHit: resolved };
    }

    if (this.age >= PROJECTILE_MAX_AGE) {
      this.setBoltPoseAtDistance(this.distanceAlongRay);
      this.bolt.tick(delta);
      return { alive: false };
    }

    this.distanceAlongRay = nextDist;
    this.setBoltPoseAtDistance(nextDist);
    this.bolt.tick(delta);
    return { alive: true };
  }

  private setBoltPoseAtDistance(distance: number): void {
    // Blend muzzle→aim so the first frames leave the barrel, then follow the ray.
    const muzzleBlend = Math.min(1, distance / Math.max(0.35, this.speed * 0.04));
    _posePos.lerpVectors(this.visualOrigin, this.aimOrigin, muzzleBlend);
    _posePos.addScaledVector(this.aimDir, distance);

    const flightT = this.speed > 1e-6 ? distance / this.speed : this.age;
    if (this.gravity > 0) {
      _posePos.y -= 0.5 * this.gravity * flightT * flightT;
    }

    _visualDir.copy(this.aimDir);
    if (this.gravity > 0 && this.speed > 1e-6) {
      _visualDir.y -= (this.gravity * flightT) / this.speed;
      if (_visualDir.lengthSq() > 1e-8) _visualDir.normalize();
    }

    this.bolt.setPose(_posePos, _visualDir);
  }

  release(): void {
    this.resolved = null;
    this.gravity = 0;
    this.object.removeFromParent();
  }
}
