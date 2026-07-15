import * as THREE from 'three';
import type { MuzzleFlashConfig } from '../../shared/content/weaponConfig';

const FIRE_FORWARD = new THREE.Vector3(0, 0, -1);
const _dir = new THREE.Vector3();
/** Scales the additive sphere burst relative to `coreScale` (particles unchanged). */
const DEFAULT_GLOW_SPHERE_SCALE = 0.42;
const DEFAULT_PARTICLE_SIZE_SCALE = 1.8;

/** Streak travel speed relative to `particleSpeed`. */
const STREAK_SPEED_SCALE = 0.85;
const STREAK_LENGTH = 0.5;
const STREAK_RADIUS = 0.022;

let streakGeometry: THREE.CylinderGeometry | null = null;

/** Shared elongated streak geometry — oriented along +Y, rotated per streak. */
function getStreakGeometry(): THREE.CylinderGeometry {
  if (!streakGeometry) {
    streakGeometry = new THREE.CylinderGeometry(
      STREAK_RADIUS * 0.4,
      STREAK_RADIUS,
      STREAK_LENGTH,
      5,
      1,
      true,
    );
    // Pivot at the tail so streaks grow away from the muzzle.
    streakGeometry.translate(0, STREAK_LENGTH * 0.5, 0);
  }
  return streakGeometry;
}

type FlashLayer = {
  mesh: THREE.Mesh;
  baseScale: number;
  expand: number;
};

type FlashStreak = {
  mesh: THREE.Mesh;
  direction: THREE.Vector3;
  speed: number;
};

export class MuzzleFlash {
  readonly object = new THREE.Group();

  private age = 0;
  private readonly duration: number;
  private readonly lightIntensity: number;
  private readonly particleBaseSize: number;
  private readonly particleFall: number;
  private readonly light: THREE.PointLight;
  private readonly layers: FlashLayer[] = [];
  private readonly streaks: FlashStreak[] = [];
  private streakMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly points: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly particleVelocities: THREE.Vector3[] = [];
  private readonly particleCount: number;

  constructor(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    config: MuzzleFlashConfig,
    /** Uniform boost on the whole burst (e.g. >1 while ADS so the zoomed-in flash still pops). */
    scale = 1,
  ) {
    this.duration = config.duration;
    this.particleCount = config.particleCount;
    this.lightIntensity = config.lightIntensity * scale;
    this.particleFall = Math.max(0, config.particleFall ?? 0);
    const particleSizeScale = config.particleSizeScale ?? DEFAULT_PARTICLE_SIZE_SCALE;
    // Point sprite size is world-space (not affected by object scale) — boost it directly.
    this.particleBaseSize = config.coreScale * particleSizeScale * scale;

    this.object.position.copy(origin);
    this.object.scale.setScalar(scale);
    _dir.copy(direction).normalize();
    this.object.quaternion.setFromUnitVectors(FIRE_FORWARD, _dir);

    const [colorA, colorB, colorC] = config.colors;
    const glowMul = config.glowScale ?? DEFAULT_GLOW_SPHERE_SCALE;
    const glowScale = config.coreScale * glowMul;
    const layerCount = config.glowLayers ?? 3;
    const allLayerSpecs: Array<{ color: number; scale: number; expand: number }> = [
      { color: colorA, scale: glowScale, expand: 0.9 },
      { color: colorB, scale: glowScale * 1.3, expand: 1.2 },
      { color: colorC, scale: glowScale * 1.55, expand: 1.45 },
    ];
    const layerSpecs = allLayerSpecs.slice(0, layerCount);

    for (const spec of layerSpecs) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.scale.setScalar(spec.scale);
      this.object.add(mesh);
      this.layers.push({ mesh, baseScale: spec.scale, expand: spec.expand });
    }

    this.light = new THREE.PointLight(colorB, config.lightIntensity, config.lightDistance);
    this.light.decay = 2;
    this.object.add(this.light);

    // Pellet streaks — one bright tongue per barrel, fanned on the pellet cone.
    const streakCount = Math.max(0, Math.round(config.streakCount ?? 0));
    if (streakCount > 0) {
      const spread = config.streakSpreadRad ?? 0.1;
      const ringPhase = Math.random() * Math.PI * 2;
      this.streakMaterial = new THREE.MeshBasicMaterial({
        color: colorA,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });

      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < streakCount; i++) {
        // First streak rides the bore; the rest fan out on the cone ring.
        const onRing = i > 0;
        const angle = ringPhase + ((i - 1) / Math.max(1, streakCount - 1)) * Math.PI * 2;
        const radius = onRing ? spread * (0.75 + Math.random() * 0.35) : 0;
        const direction = new THREE.Vector3(
          Math.sin(radius) * Math.cos(angle),
          Math.sin(radius) * Math.sin(angle),
          -Math.cos(radius),
        );

        const mesh = new THREE.Mesh(getStreakGeometry(), this.streakMaterial);
        mesh.quaternion.setFromUnitVectors(up, direction);
        mesh.scale.set(1, 0.4 + Math.random() * 0.3, 1);
        this.object.add(mesh);
        this.streaks.push({
          mesh,
          direction,
          speed: config.particleSpeed * STREAK_SPEED_SCALE * (0.85 + Math.random() * 0.3),
        });
      }
    }

    this.particlePositions = new Float32Array(config.particleCount * 3);
    const particleColors = new Float32Array(config.particleCount * 3);
    const palette = [
      new THREE.Color(colorA),
      new THREE.Color(colorB),
      new THREE.Color(colorC),
    ];

    for (let i = 0; i < config.particleCount; i++) {
      const i3 = i * 3;
      const jitter = config.coreScale * 0.35;
      this.particlePositions[i3] = (Math.random() - 0.5) * jitter;
      this.particlePositions[i3 + 1] = (Math.random() - 0.5) * jitter;
      this.particlePositions[i3 + 2] = (Math.random() - 0.5) * jitter * 0.4;

      const speed = config.particleSpeed * (0.55 + Math.random() * 0.9);
      const spread = config.particleSpread;
      const drip = this.particleFall > 0 ? -(0.35 + Math.random() * 0.65) * this.particleFall * 0.08 : 0;
      this.particleVelocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread + drip,
          -speed,
        ),
      );

      const tone = palette[i % 3];
      particleColors[i3] = tone.r;
      particleColors[i3 + 1] = tone.g;
      particleColors[i3 + 2] = tone.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    this.points = new THREE.Points(
      geometry,
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
  }

  /** @returns false when the effect is finished */
  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.duration;
    if (t >= 1) return false;

    const fade = 1 - t;
    const flash = fade * fade;

    this.light.intensity = this.lightIntensity * flash;

    for (const layer of this.layers) {
      const material = layer.mesh.material as THREE.MeshBasicMaterial;
      const scale = layer.baseScale * (1 + t * layer.expand);
      layer.mesh.scale.setScalar(scale);
      material.opacity = flash * (layer === this.layers[0] ? 1 : 0.72);
    }

    if (this.streakMaterial) {
      this.streakMaterial.opacity = flash * 0.9;
      for (const streak of this.streaks) {
        // Tail races away from the muzzle while the tongue stretches out.
        streak.mesh.position.addScaledVector(streak.direction, streak.speed * delta * 0.35);
        streak.mesh.scale.y += streak.speed * delta * 0.16;
      }
    }

    const pointMaterial = this.points.material as THREE.PointsMaterial;
    pointMaterial.opacity = flash;
    pointMaterial.size = this.particleBaseSize * (0.35 + flash * 0.65);

    const positions = this.particlePositions;
    for (let i = 0; i < this.particleCount; i++) {
      const velocity = this.particleVelocities[i];
      const i3 = i * 3;
      if (this.particleFall > 0) {
        velocity.y -= this.particleFall * delta;
      }
      positions[i3] += velocity.x * delta;
      positions[i3 + 1] += velocity.y * delta;
      positions[i3 + 2] += velocity.z * delta;
      velocity.multiplyScalar(1 - delta * (this.particleFall > 0 ? 2.2 : 4.5));
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    return true;
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.mesh.geometry.dispose();
      (layer.mesh.material as THREE.Material).dispose();
    }
    // Streak geometry is shared/module-level — only the material is per-flash.
    this.streakMaterial?.dispose();
    this.streakMaterial = null;
    this.streaks.length = 0;
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
