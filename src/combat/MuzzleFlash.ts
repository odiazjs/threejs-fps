import * as THREE from 'three';
import type { MuzzleFlashConfig } from '../../shared/content/weaponConfig';

const FIRE_FORWARD = new THREE.Vector3(0, 0, -1);
const _dir = new THREE.Vector3();
/** Scales the additive sphere burst relative to `coreScale` (particles unchanged). */
const DEFAULT_GLOW_SPHERE_SCALE = 0.42;
const DEFAULT_PARTICLE_SIZE_SCALE = 1.8;

type FlashLayer = {
  mesh: THREE.Mesh;
  baseScale: number;
  expand: number;
};

export class MuzzleFlash {
  readonly object = new THREE.Group();

  private age = 0;
  private readonly duration: number;
  private readonly lightIntensity: number;
  private readonly particleBaseSize: number;
  private readonly light: THREE.PointLight;
  private readonly layers: FlashLayer[] = [];
  private readonly points: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly particleVelocities: THREE.Vector3[] = [];
  private readonly particleCount: number;

  constructor(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    config: MuzzleFlashConfig,
  ) {
    this.duration = config.duration;
    this.particleCount = config.particleCount;
    this.lightIntensity = config.lightIntensity;
    const particleSizeScale = config.particleSizeScale ?? DEFAULT_PARTICLE_SIZE_SCALE;
    this.particleBaseSize = config.coreScale * particleSizeScale;

    this.object.position.copy(origin);
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
      this.particleVelocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
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

    const pointMaterial = this.points.material as THREE.PointsMaterial;
    pointMaterial.opacity = flash;
    pointMaterial.size = this.particleBaseSize * (0.35 + flash * 0.65);

    const positions = this.particlePositions;
    for (let i = 0; i < this.particleCount; i++) {
      const velocity = this.particleVelocities[i];
      const i3 = i * 3;
      positions[i3] += velocity.x * delta;
      positions[i3 + 1] += velocity.y * delta;
      positions[i3 + 2] += velocity.z * delta;
      velocity.multiplyScalar(1 - delta * 4.5);
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    return true;
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.mesh.geometry.dispose();
      (layer.mesh.material as THREE.Material).dispose();
    }
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
