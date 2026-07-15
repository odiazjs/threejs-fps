import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { getBoltHaloTexture } from './boltVisualShared';
import { createHitSplashSparkMaterial } from './hitSplashShared';
import {
  HIT_SPLASH_PLAYER_DURATION,
  HIT_SPLASH_WORLD_DURATION,
  HIT_SPLASH_WORLD_SCALE,
  HIT_SPLASH_PARTICLE_SCALE,
} from './projectileConfig';

export type HitSplashKind = 'world' | 'player';

const WORLD_SPARK_COLORS = [MAP_PALETTE.neonCyan, 0x88ffff, 0xffffff] as const;
const PLAYER_SPARK_COLORS = [0xff4422, 0xff8844, 0xffcc66] as const;

const _burstDir = new THREE.Vector3();

function randomBurstDirection(target: THREE.Vector3, upwardBias = 0.35): void {
  target.set(
    Math.random() - 0.5,
    Math.random() * upwardBias + 0.15,
    Math.random() - 0.5,
  ).normalize();
}

export class HitSplash {
  readonly object = new THREE.Group();
  readonly kind: HitSplashKind;

  private age = 0;
  private readonly duration: number;
  private readonly gravity: number;
  private readonly points: THREE.Points;
  private readonly flash: THREE.Sprite;
  private readonly flashBaseScale: number;
  private readonly particlePositions: Float32Array;
  private readonly particleVelocities: THREE.Vector3[] = [];
  private readonly spawnVelocities: THREE.Vector3[] = [];
  private readonly particleCount: number;
  private readonly particleBaseSize: number;
  private readonly burstSpeed: number;
  private readonly upwardBias: number;
  private positionsDirty = false;

  constructor(point: THREE.Vector3, kind: HitSplashKind = 'world') {
    this.kind = kind;
    this.object.frustumCulled = false;
    this.object.position.copy(point);

    const isPlayer = kind === 'player';
    const scale = HIT_SPLASH_WORLD_SCALE * (isPlayer ? 1.35 : 1);
    const particleScale = scale * HIT_SPLASH_PARTICLE_SCALE;
    this.duration = isPlayer ? HIT_SPLASH_PLAYER_DURATION : HIT_SPLASH_WORLD_DURATION;
    this.gravity = 14 * scale;
    this.burstSpeed = (isPlayer ? 6.5 : 5.2) * scale;
    this.upwardBias = isPlayer ? 0.45 : 0.3;

    const sparkCount = isPlayer ? 28 : 18;
    this.particleCount = sparkCount;
    this.particleBaseSize = (isPlayer ? 0.12 : 0.09) * particleScale;

    // Bright camera-facing pop at the impact point — sells the hit even when
    // the sparks are viewed edge-on or from far away.
    this.flashBaseScale = (isPlayer ? 0.85 : 0.6) * scale;
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getBoltHaloTexture(),
        color: isPlayer ? 0xff7744 : 0x9ef4ff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.flash.scale.setScalar(this.flashBaseScale);
    this.object.add(this.flash);

    this.particlePositions = new Float32Array(sparkCount * 3);
    const particleColors = new Float32Array(sparkCount * 3);
    const sparkPalette = isPlayer ? PLAYER_SPARK_COLORS : WORLD_SPARK_COLORS;
    const sparkColors = sparkPalette.map((hex) => new THREE.Color(hex));

    for (let i = 0; i < sparkCount; i++) {
      const tone = sparkColors[i % sparkColors.length]!;
      const i3 = i * 3;
      particleColors[i3] = tone.r;
      particleColors[i3 + 1] = tone.g;
      particleColors[i3 + 2] = tone.b;
      this.particleVelocities.push(new THREE.Vector3());
      this.spawnVelocities.push(new THREE.Vector3());
    }

    const sparkGeometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(this.particlePositions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    sparkGeometry.setAttribute('position', positionAttr);
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    this.points = new THREE.Points(
      sparkGeometry,
      createHitSplashSparkMaterial(isPlayer, this.particleBaseSize),
    );
    this.points.frustumCulled = false;
    this.object.add(this.points);

    this.seedSpawnVelocities();
    this.resetParticles();
  }

  restart(point: THREE.Vector3): void {
    this.object.position.copy(point);
    this.age = 0;
    this.resetParticles();
  }

  private seedSpawnVelocities(): void {
    for (let i = 0; i < this.particleCount; i++) {
      randomBurstDirection(_burstDir, this.upwardBias);
      const speed = this.burstSpeed * (0.55 + Math.random() * 0.85);
      this.spawnVelocities[i]!.copy(_burstDir).multiplyScalar(speed);
    }
  }

  private resetParticles(): void {
    for (let i = 0; i < this.particleCount; i++) {
      this.particleVelocities[i]!.copy(this.spawnVelocities[i]!);

      const i3 = i * 3;
      this.particlePositions[i3] = 0;
      this.particlePositions[i3 + 1] = 0;
      this.particlePositions[i3 + 2] = 0;
    }
    this.positionsDirty = true;

    const pointMaterial = this.points.material as THREE.PointsMaterial;
    pointMaterial.opacity = 1;
    pointMaterial.size = this.particleBaseSize;

    this.flash.material.opacity = 1;
    this.flash.scale.setScalar(this.flashBaseScale);
  }

  private flushPositionBuffer(): void {
    if (!this.positionsDirty) return;
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.positionsDirty = false;
  }

  /** @returns false when the effect is finished */
  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.duration;
    if (t >= 1) return false;

    const fade = 1 - t * t;

    const pointMaterial = this.points.material as THREE.PointsMaterial;
    pointMaterial.opacity = fade;
    pointMaterial.size = this.particleBaseSize * (0.25 + fade * 0.75);

    // Flash pops instantly and burns out over the first third of the effect,
    // swelling as it fades so the impact reads as a small energy burst.
    const flashT = Math.min(1, t * 3);
    this.flash.material.opacity = 1 - flashT;
    this.flash.scale.setScalar(this.flashBaseScale * (1 + flashT * 1.6));

    const positions = this.particlePositions;
    for (let i = 0; i < this.particleCount; i++) {
      const velocity = this.particleVelocities[i]!;
      velocity.y -= this.gravity * delta;
      velocity.multiplyScalar(1 - delta * 2.2);

      const i3 = i * 3;
      positions[i3] += velocity.x * delta;
      positions[i3 + 1] += velocity.y * delta;
      positions[i3 + 2] += velocity.z * delta;
    }
    this.positionsDirty = true;
    this.flushPositionBuffer();

    return true;
  }

  /** @deprecated Use releaseHitSplash for pooled instances. */
  dispose(): void {
    this.disposePermanent();
  }

  disposePermanent(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.flash.material.dispose();
    this.object.removeFromParent();
  }
}
