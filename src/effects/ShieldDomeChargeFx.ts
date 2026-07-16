import * as THREE from 'three';
import { acquireFxLight, releaseFxLight } from './FxLightPool';

const PARTICLE_COUNT = 48;
const CYAN = 0x00e8ff;
const CYAN_BRIGHT = 0xb8ffff;

interface ChargeParticle {
  readonly offset: THREE.Vector3;
  readonly speed: number;
  readonly phase: number;
  readonly swirl: number;
}

const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const _targetLocal = new THREE.Vector3();

export class ShieldDomeChargeFx {
  readonly object = new THREE.Group();

  private readonly particles: THREE.Points;
  private readonly particleData: ChargeParticle[];
  private readonly positions: Float32Array;
  /** Borrowed from FxLightPool — adding lights at runtime recompiles all lit shaders. */
  private light: THREE.PointLight | null = null;
  private elapsed = 0;

  constructor() {
    this.particleData = [];
    this.positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const bright = new THREE.Color(CYAN_BRIGHT);
    const base = new THREE.Color(CYAN);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const blend = Math.random();
      const color = base.clone().lerp(bright, blend);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      this.particleData.push({
        offset: new THREE.Vector3(
          (Math.random() - 0.5) * 0.55,
          (Math.random() - 0.5) * 0.35,
          -0.15 - Math.random() * 0.45,
        ),
        speed: 0.85 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        swirl: 0.4 + Math.random() * 0.9,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.09,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        sizeAttenuation: true,
      }),
    );
    this.object.add(this.particles);

    this.light = acquireFxLight(CYAN_BRIGHT, 3.5);
  }

  update(
    delta: number,
    cameraOrigin: THREE.Vector3,
    cameraForward: THREE.Vector3,
    targetFeet: THREE.Vector3,
    progress: number,
  ): void {
    this.elapsed += delta;
    const pulse = 0.75 + Math.sin(this.elapsed * 8) * 0.25;
    const ramp = THREE.MathUtils.clamp(progress, 0, 1);

    _origin.copy(cameraOrigin);
    _target.copy(targetFeet);
    _forward.copy(cameraForward).normalize();
    _right.crossVectors(_forward, THREE.Object3D.DEFAULT_UP).normalize();
    if (_right.lengthSq() < 1e-6) {
      _right.set(1, 0, 0);
    }
    _up.crossVectors(_right, _forward).normalize();

    const positions = this.positions;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = this.particleData[i]!;
      const t = THREE.MathUtils.clamp(
        ramp * particle.speed + Math.sin(this.elapsed * 5 + particle.phase) * 0.04,
        0,
        1,
      );
      const swirlAngle = this.elapsed * particle.swirl * 4 + particle.phase;
      const spread = 1 - t * 0.82;

      const spawnX =
        particle.offset.x * spread +
        Math.cos(swirlAngle) * 0.08 * spread;
      const spawnY =
        particle.offset.y * spread +
        Math.sin(swirlAngle * 1.3) * 0.06 * spread;
      const spawnZ = particle.offset.z * spread;

      const x =
        _origin.x +
        _right.x * spawnX +
        _up.x * spawnY +
        _forward.x * spawnZ +
        (_target.x - _origin.x) * t;
      const y =
        _origin.y +
        _right.y * spawnX +
        _up.y * spawnY +
        _forward.y * spawnZ +
        (_target.y - _origin.y) * t * 1.05;
      const z =
        _origin.z +
        _right.z * spawnX +
        _up.z * spawnY +
        _forward.z * spawnZ +
        (_target.z - _origin.z) * t;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    this.particles.geometry.attributes.position!.needsUpdate = true;
    (this.particles.material as THREE.PointsMaterial).opacity =
      (0.35 + ramp * 0.55) * pulse;
    if (this.light) {
      this.light.position.set(
        _origin.x + _forward.x * 0.2,
        _origin.y + _forward.y * 0.2,
        _origin.z + _forward.z * 0.2,
      );
      this.light.intensity = 0.6 + ramp * 1.4 + pulse * 0.35;
    }
  }

  /** First-person view — fx.object must be parented to the camera. */
  updateCameraAttached(
    delta: number,
    camera: THREE.Camera,
    targetWorld: THREE.Vector3,
    progress: number,
  ): void {
    this.elapsed += delta;
    const pulse = 0.75 + Math.sin(this.elapsed * 8) * 0.25;
    const ramp = THREE.MathUtils.clamp(progress, 0, 1);

    _targetLocal.copy(targetWorld);
    camera.worldToLocal(_targetLocal);

    const positions = this.positions;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = this.particleData[i]!;
      const t = THREE.MathUtils.clamp(
        ramp * particle.speed + Math.sin(this.elapsed * 5 + particle.phase) * 0.04,
        0,
        1,
      );
      const swirlAngle = this.elapsed * particle.swirl * 4 + particle.phase;
      const spread = 1 - t * 0.82;

      const spawnX =
        particle.offset.x * spread +
        Math.cos(swirlAngle) * 0.08 * spread;
      const spawnY =
        particle.offset.y * spread +
        Math.sin(swirlAngle * 1.3) * 0.06 * spread;
      const spawnZ = particle.offset.z * spread;

      positions[i * 3] = spawnX + (_targetLocal.x - spawnX) * t;
      positions[i * 3 + 1] = spawnY + (_targetLocal.y - spawnY) * t * 1.05;
      positions[i * 3 + 2] = spawnZ + (_targetLocal.z - spawnZ) * t;
    }

    this.particles.geometry.attributes.position!.needsUpdate = true;
    (this.particles.material as THREE.PointsMaterial).opacity =
      (0.45 + ramp * 0.55) * pulse;
    if (this.light) {
      // Pool lights live at scene level — camera-local (0,0,-0.25) in world space.
      camera.getWorldPosition(this.light.position);
      camera.getWorldDirection(_forward);
      this.light.position.addScaledVector(_forward, 0.25);
      this.light.intensity = 0.8 + ramp * 1.6 + pulse * 0.4;
    }
  }

  dispose(): void {
    releaseFxLight(this.light);
    this.light = null;
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
