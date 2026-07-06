import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import {
  HIT_SPLASH_PLAYER_DURATION,
  HIT_SPLASH_WORLD_DURATION,
  HIT_SPLASH_WORLD_SCALE,
  HIT_SPLASH_PARTICLE_SCALE,
} from './projectileConfig';

export type HitSplashKind = 'world' | 'player';

const WORLD_SPARK_COLORS = [MAP_PALETTE.neonCyan, 0x88ffff, 0xffffff] as const;
const WORLD_CHIP_COLORS = [MAP_PALETTE.steelGrey, MAP_PALETTE.carbonGrey, 0xaaccdd] as const;
const PLAYER_SPARK_COLORS = [0xff4422, 0xff8844, 0xffcc66] as const;
const PLAYER_CHIP_COLORS = [0xcc5533, 0x994422, MAP_PALETTE.pastelOrange] as const;

const _burstDir = new THREE.Vector3();

interface DebrisShard {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  initialScale: THREE.Vector3;
}

function randomBurstDirection(target: THREE.Vector3, upwardBias = 0.35): void {
  target.set(
    Math.random() - 0.5,
    Math.random() * upwardBias + 0.15,
    Math.random() - 0.5,
  ).normalize();
}

export class HitSplash {
  readonly object = new THREE.Group();

  private age = 0;
  private readonly duration: number;
  private readonly gravity: number;
  private readonly shards: DebrisShard[] = [];
  private readonly points: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly particleVelocities: THREE.Vector3[] = [];
  private readonly particleCount: number;
  private readonly particleBaseSize: number;
  private readonly light: THREE.PointLight;
  private readonly chipGeometry: THREE.BoxGeometry;

  constructor(point: THREE.Vector3, kind: HitSplashKind = 'world') {
    this.object.position.copy(point);

    const isPlayer = kind === 'player';
    const scale = HIT_SPLASH_WORLD_SCALE * (isPlayer ? 1.35 : 1);
    const particleScale = scale * HIT_SPLASH_PARTICLE_SCALE;
    this.duration = isPlayer ? HIT_SPLASH_PLAYER_DURATION : HIT_SPLASH_WORLD_DURATION;
    this.gravity = 14 * scale;

    const sparkPalette = isPlayer ? PLAYER_SPARK_COLORS : WORLD_SPARK_COLORS;
    const chipPalette = isPlayer ? PLAYER_CHIP_COLORS : WORLD_CHIP_COLORS;
    const sparkCount = isPlayer ? 28 : 22;
    const shardCount = isPlayer ? 10 : 8;
    const burstSpeed = (isPlayer ? 5.5 : 4.2) * scale;
    this.particleCount = sparkCount;
    this.particleBaseSize = (isPlayer ? 0.11 : 0.09) * particleScale;

    this.light = new THREE.PointLight(sparkPalette[1], isPlayer ? 2.8 : 1.8, 3.5 * scale);
    this.light.decay = 2;
    this.object.add(this.light);

    this.particlePositions = new Float32Array(sparkCount * 3);
    const particleColors = new Float32Array(sparkCount * 3);
    const sparkColors = sparkPalette.map((hex) => new THREE.Color(hex));

    for (let i = 0; i < sparkCount; i++) {
      randomBurstDirection(_burstDir, isPlayer ? 0.45 : 0.3);
      const speed = burstSpeed * (0.55 + Math.random() * 0.85);
      this.particleVelocities.push(
        _burstDir.clone().multiplyScalar(speed),
      );

      const tone = sparkColors[i % sparkColors.length]!;
      const i3 = i * 3;
      particleColors[i3] = tone.r;
      particleColors[i3 + 1] = tone.g;
      particleColors[i3 + 2] = tone.b;
    }

    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    this.points = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({
        size: this.particleBaseSize,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        sizeAttenuation: true,
      }),
    );
    this.object.add(this.points);

    this.chipGeometry = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < shardCount; i++) {
      randomBurstDirection(_burstDir, isPlayer ? 0.5 : 0.35);
      const speed = burstSpeed * (0.4 + Math.random() * 0.7);
      const chipSize = (0.04 + Math.random() * 0.06) * particleScale * (isPlayer ? 1.15 : 1);
      const color = chipPalette[i % chipPalette.length]!;

      const mesh = new THREE.Mesh(
        this.chipGeometry,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.scale.set(
        chipSize * (0.6 + Math.random() * 0.8),
        chipSize * (0.4 + Math.random() * 0.6),
        chipSize * (0.5 + Math.random() * 0.9),
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      this.object.add(mesh);

      this.shards.push({
        mesh,
        velocity: _burstDir.clone().multiplyScalar(speed),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
        ),
        initialScale: mesh.scale.clone(),
      });
    }
  }

  /** @returns false when the effect is finished */
  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.duration;
    if (t >= 1) return false;

    const fade = 1 - t * t;
    this.light.intensity *= 1 - delta * 8;

    const pointMaterial = this.points.material as THREE.PointsMaterial;
    pointMaterial.opacity = fade;
    pointMaterial.size = this.particleBaseSize * (0.25 + fade * 0.75);

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
    this.points.geometry.attributes.position.needsUpdate = true;

    for (const shard of this.shards) {
      shard.velocity.y -= this.gravity * delta;
      shard.velocity.multiplyScalar(1 - delta * 1.8);
      shard.mesh.position.addScaledVector(shard.velocity, delta);
      shard.mesh.rotation.x += shard.spin.x * delta;
      shard.mesh.rotation.y += shard.spin.y * delta;
      shard.mesh.rotation.z += shard.spin.z * delta;

      const shrink = Math.max(0.12, fade);
      shard.mesh.scale.set(
        shard.initialScale.x * shrink,
        shard.initialScale.y * shrink,
        shard.initialScale.z * shrink,
      );

      const material = shard.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = fade * 0.95;
    }

    return true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.chipGeometry.dispose();
    for (const shard of this.shards) {
      (shard.mesh.material as THREE.Material).dispose();
    }
    this.object.removeFromParent();
  }
}
