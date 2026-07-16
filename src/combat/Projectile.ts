import * as THREE from 'three';
import { PROJECTILE_MAX_AGE } from './projectileConfig';
import {
  ProjectileBoltVisual,
  type ProjectileBoltStyle,
} from './ProjectileBoltVisual';
import { ProjectileSmokeTrail } from './ProjectileSmokeTrail';
import type { ResolvedProjectilePath } from './projectilePathResolve';

const _posePos = new THREE.Vector3();
const _visualDir = new THREE.Vector3();

// update() runs for every live projectile every frame — reuse result objects
// (consumed synchronously by ProjectileManager) instead of allocating each call.
const ALIVE_RESULT: ProjectileUpdateResult = { alive: true };
const DEAD_RESULT: {
  alive: false;
  hit?: ProjectileHit;
  resolvedHit?: ResolvedProjectilePath;
} = { alive: false };

function deadResult(resolvedHit?: ResolvedProjectilePath): ProjectileUpdateResult {
  DEAD_RESULT.hit = undefined;
  DEAD_RESULT.resolvedHit = resolvedHit;
  return DEAD_RESULT;
}

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
  /** Uniform bolt scale (shotgun pellets run smaller than rifle bolts). */
  sizeScale?: number;
}

export class Projectile {
  readonly object = new THREE.Group();
  readonly smokeTrail = new ProjectileSmokeTrail();

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
    // Pooled instances may be parked hidden (GPU prewarm) — always re-show.
    this.object.visible = true;
    this.smokeTrail.object.visible = true;
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
      sizeScale: visualOptions.sizeScale,
    });
    this.smokeTrail.reset(visualOptions.sizeScale ?? 1);
    this.bolt.setPose(params.visualOrigin, this.aimDir);
  }

  /**
   * Pose a pooled instance for the shader-compile prewarm pass: configures a
   * bolt style (so its meshes are visible for compile) and emits one smoke
   * puff so every material/geometry combo is live before first combat use.
   */
  prewarmAt(position: THREE.Vector3, direction: THREE.Vector3, style: ProjectileBoltStyle): void {
    this.object.visible = true;
    this.bolt.configure({ style });
    this.bolt.setPose(position, direction);
    this.smokeTrail.reset();
    this.smokeTrail.emit(position, direction, 1);
    this.smokeTrail.update(0.016);
    this.smokeTrail.stopEmitting();
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
      return deadResult();
    }

    const step = this.speed * delta;
    if (step <= 1e-8) {
      this.setBoltPoseAtDistance(this.distanceAlongRay);
      this.bolt.tick(delta);
      this.smokeTrail.emit(_posePos, _visualDir, delta);
      this.smokeTrail.update(delta);
      return ALIVE_RESULT;
    }

    const nextDist = this.distanceAlongRay + step;

    if (nextDist >= resolved.hitDistance) {
      this.distanceAlongRay = resolved.hitDistance;
      this.setBoltPoseAtDistance(this.distanceAlongRay);
      this.bolt.tick(delta);
      this.smokeTrail.emit(_posePos, _visualDir, delta);
      this.smokeTrail.update(delta);
      return deadResult(resolved);
    }

    if (this.age >= PROJECTILE_MAX_AGE) {
      this.setBoltPoseAtDistance(this.distanceAlongRay);
      this.bolt.tick(delta);
      this.smokeTrail.emit(_posePos, _visualDir, delta);
      this.smokeTrail.update(delta);
      return deadResult();
    }

    this.distanceAlongRay = nextDist;
    this.setBoltPoseAtDistance(nextDist);
    this.bolt.tick(delta);
    this.smokeTrail.emit(_posePos, _visualDir, delta);
    this.smokeTrail.update(delta);
    return ALIVE_RESULT;
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
    this.smokeTrail.stopEmitting();
    this.object.removeFromParent();
  }

  /** Keep updating smoke after the bolt is gone until wisps fade out. */
  updateFadingSmoke(delta: number): boolean {
    return this.smokeTrail.update(delta);
  }

  disposeSmokeTrail(): void {
    this.smokeTrail.dispose();
  }
}
