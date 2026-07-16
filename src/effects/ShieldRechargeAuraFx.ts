import * as THREE from 'three';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import { acquireFxLight, releaseFxLight } from './FxLightPool';

const CENTER_Y = PLAYER_HIT_CAPSULE_HEIGHT * 0.52;
const AURA_RADIUS = 0.82;
const PARTICLE_COUNT = 56;
const CYAN_BRIGHT = 0x9afbff;

const _lightWorld = new THREE.Vector3();

interface OrbitalParticle {
  readonly angle: number;
  readonly height: number;
  readonly radius: number;
  readonly speed: number;
  readonly phase: number;
  readonly bob: number;
}

export class ShieldRechargeAuraFx {
  readonly object = new THREE.Group();

  private active = false;
  private elapsed = 0;
  /** Borrowed from FxLightPool — adding lights at runtime recompiles all lit shaders. */
  private light: THREE.PointLight | null = null;
  private readonly particles: THREE.Points;
  private readonly particleOffsets: OrbitalParticle[];
  private readonly particlePositions: Float32Array;

  constructor() {
    this.object.position.y = CENTER_Y;
    this.object.visible = false;

    this.particleOffsets = [];
    this.particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const bright = new THREE.Color(CYAN_BRIGHT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      this.particleOffsets.push({
        angle: t * Math.PI * 2 + Math.random() * 0.4,
        height: (Math.random() - 0.5) * PLAYER_HIT_CAPSULE_HEIGHT * 0.72,
        radius: AURA_RADIUS * (0.92 + Math.random() * 0.22),
        speed: 1.1 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        bob: 0.08 + Math.random() * 0.14,
      });

      colors[i * 3] = bright.r;
      colors[i * 3 + 1] = bright.g;
      colors[i * 3 + 2] = bright.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.11,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        sizeAttenuation: true,
      }),
    );
    this.object.add(this.particles);
  }

  setActive(active: boolean): void {
    if (active && !this.active) {
      this.elapsed = 0;
      this.light ??= acquireFxLight(CYAN_BRIGHT, 4.5);
    }
    if (!active && this.light) {
      releaseFxLight(this.light);
      this.light = null;
    }
    this.active = active;
    this.object.visible = active;
  }

  update(delta: number, _camera: THREE.Camera | null, progress: number): void {
    if (!this.active) {
      this.object.visible = false;
      return;
    }

    this.object.visible = true;
    this.elapsed += delta;

    const pulse = 0.5 + Math.sin(this.elapsed * 5.2) * 0.22;
    const ramp = 0.55 + progress * 0.45;

    if (this.light) {
      this.light.position.copy(this.object.getWorldPosition(_lightWorld));
      this.light.intensity = 1.1 + pulse * 1.4 + progress * 0.35;
    }

    const positions = this.particlePositions;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = this.particleOffsets[i]!;
      const angle = particle.angle + this.elapsed * particle.speed;
      const bob = Math.sin(this.elapsed * 4.6 + particle.phase) * particle.bob;
      const rise = Math.sin(this.elapsed * 2.2 + particle.phase) * 0.06;

      positions[i * 3] = Math.cos(angle) * particle.radius;
      positions[i * 3 + 1] = particle.height + bob + rise;
      positions[i * 3 + 2] = Math.sin(angle) * particle.radius;
    }

    this.particles.geometry.attributes.position!.needsUpdate = true;
    (this.particles.material as THREE.PointsMaterial).opacity = (0.55 + pulse * 0.35) * ramp;
  }

  dispose(): void {
    releaseFxLight(this.light);
    this.light = null;
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
