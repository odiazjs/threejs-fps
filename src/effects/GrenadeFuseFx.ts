import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { GRENADE_FUSE_SEC } from '../../shared/throwables/grenadeConfig';

const CYAN = MAP_PALETTE.neonCyan;
const CYAN_SOFT = 0x9ef6ff;
const ORBIT_COUNT = 26;
const TICK_SPARK_COUNT = 52;
const TICK_DURATION = 0.48;

const FX = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
} as const;

/** Glowing fuse countdown ticks on a live grenade. */
export class GrenadeFuseFx {
  readonly object = new THREE.Group();

  private readonly coreGlow: THREE.Mesh;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly haloGlow: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly orbit: THREE.Points;
  private readonly orbitMat: THREE.PointsMaterial;
  private readonly tickSparks: THREE.Points;
  private readonly tickSparkMat: THREE.PointsMaterial;
  private readonly tickSparkPositions: Float32Array;
  private readonly tickSparkVelocities: THREE.Vector3[] = [];
  private readonly orbitAngles: number[] = [];
  private readonly orbitRadii: number[] = [];
  private readonly orbitHeights: number[] = [];

  private orbitPhase = 0;
  private tickSparkAge = TICK_DURATION;
  private pulseBoost = 0;

  constructor() {
    this.object.frustumCulled = false;

    this.coreMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      ...FX,
      opacity: 0.55,
    });
    this.coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), this.coreMat);
    this.coreGlow.renderOrder = 14;
    this.object.add(this.coreGlow);

    this.haloMat = new THREE.MeshBasicMaterial({
      color: CYAN_SOFT,
      ...FX,
      opacity: 0.35,
    });
    this.haloGlow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), this.haloMat);
    this.haloGlow.renderOrder = 13;
    this.object.add(this.haloGlow);

    const orbitPositions = new Float32Array(ORBIT_COUNT * 3);
    const orbitColors = new Float32Array(ORBIT_COUNT * 3);
    const color = new THREE.Color(CYAN_SOFT);

    for (let i = 0; i < ORBIT_COUNT; i++) {
      this.orbitAngles.push(Math.random() * Math.PI * 2);
      this.orbitRadii.push(0.12 + Math.random() * 0.08);
      this.orbitHeights.push((Math.random() - 0.5) * 0.1);
      const i3 = i * 3;
      orbitColors[i3] = color.r;
      orbitColors[i3 + 1] = color.g;
      orbitColors[i3 + 2] = color.b;
    }

    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
    orbitGeo.setAttribute('color', new THREE.BufferAttribute(orbitColors, 3));

    this.orbitMat = new THREE.PointsMaterial({
      size: 0.085,
      vertexColors: true,
      ...FX,
      opacity: 0.95,
      sizeAttenuation: true,
    });
    this.orbit = new THREE.Points(orbitGeo, this.orbitMat);
    this.orbit.renderOrder = 15;
    this.object.add(this.orbit);

    this.tickSparkPositions = new Float32Array(TICK_SPARK_COUNT * 3);
    const tickColors = new Float32Array(TICK_SPARK_COUNT * 3);
    const hot = new THREE.Color(CYAN);

    for (let i = 0; i < TICK_SPARK_COUNT; i++) {
      this.tickSparkVelocities.push(new THREE.Vector3());
      const i3 = i * 3;
      tickColors[i3] = hot.r;
      tickColors[i3 + 1] = hot.g;
      tickColors[i3 + 2] = hot.b;
    }

    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.BufferAttribute(this.tickSparkPositions, 3));
    tickGeo.setAttribute('color', new THREE.BufferAttribute(tickColors, 3));

    this.tickSparkMat = new THREE.PointsMaterial({
      size: 0.13,
      vertexColors: true,
      ...FX,
      opacity: 0,
      sizeAttenuation: true,
    });
    this.tickSparks = new THREE.Points(tickGeo, this.tickSparkMat);
    this.tickSparks.renderOrder = 16;
    this.object.add(this.tickSparks);
  }

  pulse(secondsRemaining: number): void {
    const urgency = 1 + (GRENADE_FUSE_SEC - secondsRemaining) * 0.65;
    this.pulseBoost = urgency;
    this.tickSparkAge = 0;

    for (let i = 0; i < TICK_SPARK_COUNT; i++) {
      const vel = this.tickSparkVelocities[i]!;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (3.2 + Math.random() * 6.5) * urgency;
      vel.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed * 0.8 + Math.random() * 2,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      const i3 = i * 3;
      this.tickSparkPositions[i3] = 0;
      this.tickSparkPositions[i3 + 1] = 0;
      this.tickSparkPositions[i3 + 2] = 0;
    }
    this.tickSparks.geometry.attributes.position!.needsUpdate = true;
  }

  update(delta: number, fuseEndAt: number, worldTime: number): void {
    const remaining = fuseEndAt - worldTime;
    if (remaining <= 0) {
      this.object.visible = false;
      return;
    }

    this.object.visible = true;
    const urgency = 1 - remaining / GRENADE_FUSE_SEC;
    this.orbitPhase += delta * (18 + urgency * 48);
    this.pulseBoost = Math.max(0, this.pulseBoost - delta * 2.8);

    const orbitPositions = this.orbit.geometry.attributes.position as THREE.BufferAttribute;
    const pulse = 0.7 + Math.sin(this.orbitPhase * 3.1) * 0.3 + this.pulseBoost * 0.55;
    const corePulse = 0.65 + Math.sin(this.orbitPhase * 4.8) * 0.35 + this.pulseBoost * 0.4;

    for (let i = 0; i < ORBIT_COUNT; i++) {
      const angle = this.orbitAngles[i]! + this.orbitPhase * (1.25 + i * 0.06);
      const radius = this.orbitRadii[i]! * (1 + this.pulseBoost * 0.35);
      const i3 = i * 3;
      orbitPositions.array[i3] = Math.cos(angle) * radius;
      orbitPositions.array[i3 + 1] = this.orbitHeights[i]! + Math.sin(angle * 2.4) * 0.03;
      orbitPositions.array[i3 + 2] = Math.sin(angle) * radius;
    }
    orbitPositions.needsUpdate = true;

    this.orbitMat.opacity = (0.55 + urgency * 0.45) * pulse;
    this.orbitMat.size = 0.07 + urgency * 0.05 + this.pulseBoost * 0.04;

    this.coreMat.opacity = (0.45 + urgency * 0.5) * corePulse;
    this.haloMat.opacity = (0.3 + urgency * 0.45) * corePulse;
    const haloScale = 1 + urgency * 0.35 + this.pulseBoost * 0.25;
    this.haloGlow.scale.setScalar(haloScale);
    this.coreGlow.scale.setScalar(0.85 + urgency * 0.35 + this.pulseBoost * 0.2);

    if (this.tickSparkAge < TICK_DURATION) {
      this.tickSparkAge += delta;
      const t = this.tickSparkAge / TICK_DURATION;
      const fade = 1 - t * t;

      for (let i = 0; i < TICK_SPARK_COUNT; i++) {
        const vel = this.tickSparkVelocities[i]!;
        vel.y -= 11 * delta;
        const i3 = i * 3;
        this.tickSparkPositions[i3]! += vel.x * delta;
        this.tickSparkPositions[i3 + 1]! += vel.y * delta;
        this.tickSparkPositions[i3 + 2]! += vel.z * delta;
      }
      this.tickSparks.geometry.attributes.position!.needsUpdate = true;
      this.tickSparkMat.opacity = fade * (0.85 + this.pulseBoost * 0.45);
      this.tickSparkMat.size = 0.11 + (1 - t) * 0.12 + this.pulseBoost * 0.05;
    } else {
      this.tickSparkMat.opacity = 0;
    }
  }

  dispose(): void {
    this.coreGlow.geometry.dispose();
    this.coreMat.dispose();
    this.haloGlow.geometry.dispose();
    this.haloMat.dispose();
    this.orbit.geometry.dispose();
    this.orbitMat.dispose();
    this.tickSparks.geometry.dispose();
    this.tickSparkMat.dispose();
  }
}
