import * as THREE from 'three';
import { getSmokePuffTexture } from './smokeTrailShared';

const DEFAULT_MAX_PARTICLES = 52;
const EMIT_INTERVAL_SEC = 0.006;
const PUFF_LIFE_SEC = 0.72;
const PUFF_BASE_SIZE = 0.12;
const PUFFS_PER_EMIT = 2;

const _behind = new THREE.Vector3();
const _drift = new THREE.Vector3();

interface SmokePuff {
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

/**
 * World-space wisps that linger behind a flying projectile — thin grey puffs
 * along the flight path (Apex-style bullet smoke).
 */
export class ProjectileSmokeTrail {
  readonly object = new THREE.Group();

  private readonly maxParticles: number;
  private readonly particles: SmokePuff[] = [];
  private readonly positions: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly points: THREE.Points;

  private emitting = false;
  private emitCooldown = 0;
  private intensity = 1;

  constructor(maxParticles = DEFAULT_MAX_PARTICLES) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      map: getSmokePuffTexture(),
      color: 0xe8eef4,
      size: PUFF_BASE_SIZE,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      sizeAttenuation: true,
      alphaTest: 0.01,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.object.add(this.points);
  }

  reset(intensity = 1): void {
    this.particles.length = 0;
    this.emitting = true;
    this.emitCooldown = 0;
    this.intensity = Math.max(0.45, intensity);
    this.geometry.setDrawRange(0, 0);
    this.material.opacity = 0.62;
  }

  stopEmitting(): void {
    this.emitting = false;
  }

  isActive(): boolean {
    return this.emitting || this.particles.length > 0;
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3, delta: number): void {
    if (!this.emitting) return;

    this.emitCooldown -= delta;
    if (this.emitCooldown > 0) return;
    this.emitCooldown = EMIT_INTERVAL_SEC / this.intensity;

    _behind.copy(direction).multiplyScalar(-(0.08 + Math.random() * 0.07));
    _drift
      .copy(direction)
      .multiplyScalar(-(1.1 + Math.random() * 1.8) * this.intensity);
    _drift.y += 0.1 + Math.random() * 0.16;
    _drift.x += (Math.random() - 0.5) * 0.55;
    _drift.z += (Math.random() - 0.5) * 0.55;

    for (let n = 0; n < PUFFS_PER_EMIT; n++) {
      this.particles.push({
        age: 0,
        x: origin.x + _behind.x + (Math.random() - 0.5) * 0.035,
        y: origin.y + _behind.y + (Math.random() - 0.5) * 0.035,
        z: origin.z + _behind.z + (Math.random() - 0.5) * 0.035,
        vx: _drift.x + (Math.random() - 0.5) * 0.25,
        vy: _drift.y + (Math.random() - 0.5) * 0.15,
        vz: _drift.z + (Math.random() - 0.5) * 0.25,
        size: PUFF_BASE_SIZE * this.intensity * (0.85 + Math.random() * 0.45),
      });
    }

    while (this.particles.length > this.maxParticles) {
      this.particles.shift();
    }
  }

  /** @returns false when all puffs have faded and emitting is off */
  update(delta: number): boolean {
    let maxOpacity = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const puff = this.particles[i]!;
      puff.age += delta;
      if (puff.age >= PUFF_LIFE_SEC) {
        this.particles.splice(i, 1);
        continue;
      }

      puff.x += puff.vx * delta;
      puff.y += puff.vy * delta;
      puff.z += puff.vz * delta;
      puff.vx *= 1 - delta * 2.2;
      puff.vy *= 1 - delta * 1.8;
      puff.vz *= 1 - delta * 2.2;

      const lifeT = puff.age / PUFF_LIFE_SEC;
      const fade = (1 - lifeT) * (1 - lifeT * 0.35);
      maxOpacity = Math.max(maxOpacity, fade);
    }

    const count = this.particles.length;
    for (let i = 0; i < count; i++) {
      const puff = this.particles[i]!;
      const i3 = i * 3;
      this.positions[i3] = puff.x;
      this.positions[i3 + 1] = puff.y;
      this.positions[i3 + 2] = puff.z;
    }

    this.geometry.setDrawRange(0, count);
    this.geometry.attributes.position.needsUpdate = true;

    this.material.size = PUFF_BASE_SIZE * this.intensity * (1.25 + maxOpacity * 0.55);
    this.material.opacity = 0.38 + maxOpacity * 0.52;

    return this.isActive();
  }

  dispose(): void {
    this.particles.length = 0;
    this.emitting = false;
    this.geometry.setDrawRange(0, 0);
    this.object.removeFromParent();
  }
}
