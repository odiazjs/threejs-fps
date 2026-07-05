import * as THREE from 'three';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';

const DURATION_SEC = 1.35;
const SHARD_COUNT = 18;
const SHIELD_RADIUS = 0.94;
const CENTER_Y = PLAYER_HIT_CAPSULE_HEIGHT * 0.56;

const CYAN = new THREE.Color(0x00d8ff);
const CYAN_BRIGHT = new THREE.Color(0x9afbff);

const FX = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
} as const;

// Shared GPU resources — one copy for all shield-break instances.
const SHELL_GEOMETRY = new THREE.SphereGeometry(SHIELD_RADIUS, 14, 10);
const RIM_GEOMETRY = new THREE.SphereGeometry(SHIELD_RADIUS * 1.04, 12, 8);

function randomSphereDirection(): THREE.Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

/** Fast shield-break burst — low-poly shells + point shards. */
export class ShieldBreakFx {
  readonly object = new THREE.Group();

  private age = DURATION_SEC;
  private readonly shell: THREE.Mesh;
  private readonly shellMaterial: THREE.MeshBasicMaterial;
  private readonly rim: THREE.Mesh;
  private readonly rimMaterial: THREE.MeshBasicMaterial;
  private readonly shards: THREE.Points;
  private readonly shardMaterial: THREE.PointsMaterial;
  private readonly shardPositions: Float32Array;
  private readonly shardStarts: THREE.Vector3[] = [];
  private readonly shardVelocities: THREE.Vector3[] = [];
  private readonly shardDelays: number[] = [];

  constructor() {
    this.object.position.y = CENTER_Y;
    this.object.visible = false;
    this.object.frustumCulled = true;

    this.shellMaterial = new THREE.MeshBasicMaterial({
      color: CYAN,
      ...FX,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    this.shell = new THREE.Mesh(SHELL_GEOMETRY, this.shellMaterial);
    this.object.add(this.shell);

    this.rimMaterial = new THREE.MeshBasicMaterial({
      color: CYAN_BRIGHT,
      ...FX,
      opacity: 0.85,
      side: THREE.BackSide,
    });
    this.rim = new THREE.Mesh(RIM_GEOMETRY, this.rimMaterial);
    this.object.add(this.rim);

    this.shardPositions = new Float32Array(SHARD_COUNT * 3);
    const shardColors = new Float32Array(SHARD_COUNT * 3);
    for (let i = 0; i < SHARD_COUNT; i++) {
      const dir = randomSphereDirection();
      const start = dir.clone().multiplyScalar(SHIELD_RADIUS * (0.88 + Math.random() * 0.1));
      const speed = 1.2 + Math.random() * 2.2;
      const velocity = dir.multiplyScalar(speed);
      velocity.y += 0.3 + Math.random() * 0.55;

      this.shardStarts.push(start);
      this.shardVelocities.push(velocity);
      this.shardDelays.push(Math.random() * 0.1);

      const i3 = i * 3;
      shardColors[i3] = CYAN_BRIGHT.r;
      shardColors[i3 + 1] = CYAN_BRIGHT.g;
      shardColors[i3 + 2] = CYAN_BRIGHT.b;
    }

    const shardGeometry = new THREE.BufferGeometry();
    shardGeometry.setAttribute('position', new THREE.BufferAttribute(this.shardPositions, 3));
    shardGeometry.setAttribute('color', new THREE.BufferAttribute(shardColors, 3));

    this.shardMaterial = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      ...FX,
      opacity: 0.95,
      sizeAttenuation: true,
    });
    this.shards = new THREE.Points(shardGeometry, this.shardMaterial);
    this.object.add(this.shards);
  }

  play(): void {
    this.age = 0;
    this.object.visible = true;
    this.shell.visible = true;
    this.rim.visible = true;
    this.shell.scale.setScalar(1);
    this.rim.scale.setScalar(1);
    this.shellMaterial.opacity = 0.55;
    this.rimMaterial.opacity = 0.85;
    this.shardMaterial.opacity = 0.95;

    for (let i = 0; i < SHARD_COUNT; i++) {
      const i3 = i * 3;
      const start = this.shardStarts[i]!;
      this.shardPositions[i3] = start.x;
      this.shardPositions[i3 + 1] = start.y;
      this.shardPositions[i3 + 2] = start.z;
    }
    this.shards.geometry.attributes.position!.needsUpdate = true;
  }

  /** Returns false once the effect has finished and can be disposed. */
  update(delta: number, _camera?: THREE.Camera | null): boolean {
    if (this.age >= DURATION_SEC) {
      this.object.visible = false;
      return false;
    }

    this.age += delta;
    const t = this.age / DURATION_SEC;
    const fade = 1 - Math.pow(t, 1.2);
    const flash = Math.exp(-this.age * 5.2);
    const expand = THREE.MathUtils.smoothstep(this.age, 0, 0.35);

    const shellOpacity = fade * (0.35 + flash * 0.45);
    this.shellMaterial.opacity = shellOpacity;
    this.rimMaterial.opacity = fade * (0.5 + flash * 0.5);
    this.shardMaterial.opacity = fade * 0.95;

    const scale = 1 + expand * 0.14;
    this.shell.scale.setScalar(scale);
    this.rim.scale.setScalar(scale * 1.02);

    if (t > 0.88) {
      this.shell.visible = false;
      this.rim.visible = false;
    }

    let positionsDirty = false;
    for (let i = 0; i < SHARD_COUNT; i++) {
      const shardT = Math.max(0, this.age - this.shardDelays[i]!);
      const i3 = i * 3;
      if (shardT <= 0) {
        this.shardPositions[i3 + 1] = -999;
        positionsDirty = true;
        continue;
      }

      const start = this.shardStarts[i]!;
      const velocity = this.shardVelocities[i]!;
      this.shardPositions[i3] = start.x + velocity.x * shardT;
      this.shardPositions[i3 + 1] = start.y + velocity.y * shardT;
      this.shardPositions[i3 + 2] = start.z + velocity.z * shardT;
      positionsDirty = true;
    }

    if (positionsDirty) {
      this.shards.geometry.attributes.position!.needsUpdate = true;
    }

    return true;
  }

  dispose(): void {
    this.shellMaterial.dispose();
    this.rimMaterial.dispose();
    this.shards.geometry.dispose();
    this.shardMaterial.dispose();
    this.object.removeFromParent();
  }
}
