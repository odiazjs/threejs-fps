import * as THREE from 'three';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import { createHexShieldMaterial } from './shieldHexMaterial';

const DURATION_SEC = 1.55;
const SHARD_COUNT = 32;
const SHIELD_RADIUS = 0.94;
const CENTER_Y = PLAYER_HIT_CAPSULE_HEIGHT * 0.56;

const CYAN = 0x00d8ff;
const CYAN_BRIGHT = 0x9afbff;

interface HexShard {
  readonly mesh: THREE.Mesh;
  readonly start: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  readonly baseRotation: THREE.Euler;
  readonly delay: number;
}

function createHexShardGeometry(radius = 0.075): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

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

export class ShieldBreakFx {
  readonly object = new THREE.Group();

  private age = DURATION_SEC;
  private readonly shieldMesh: THREE.Mesh;
  private readonly shieldMaterial: ReturnType<typeof createHexShieldMaterial>;
  private readonly innerGlow: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private readonly shards: HexShard[] = [];
  private readonly shardGeometry = createHexShardGeometry();

  constructor() {
    this.object.position.y = CENTER_Y;
    this.object.visible = false;

    this.shieldMaterial = createHexShieldMaterial();
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SHIELD_RADIUS, 40, 32),
      this.shieldMaterial,
    );
    this.object.add(this.shieldMesh);

    this.innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(SHIELD_RADIUS * 0.97, 28, 22),
      new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.object.add(this.innerGlow);

    this.light = new THREE.PointLight(CYAN_BRIGHT, 0, 5.5, 2);
    this.object.add(this.light);

    const shardMaterial = new THREE.MeshBasicMaterial({
      color: CYAN_BRIGHT,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    for (let i = 0; i < SHARD_COUNT; i++) {
      const dir = randomSphereDirection();
      const start = dir.clone().multiplyScalar(SHIELD_RADIUS * (0.88 + Math.random() * 0.12));
      const speed = 1.1 + Math.random() * 2.4;
      const velocity = dir.clone().multiplyScalar(speed);
      velocity.y += 0.25 + Math.random() * 0.65;

      const mesh = new THREE.Mesh(this.shardGeometry, shardMaterial.clone());
      mesh.position.copy(start);
      const baseRotation = new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      mesh.quaternion.setFromEuler(baseRotation);
      mesh.visible = false;
      this.object.add(mesh);

      this.shards.push({
        mesh,
        start,
        velocity,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
        ),
        baseRotation,
        delay: Math.random() * 0.12,
      });
    }
  }

  play(): void {
    this.age = 0;
    this.object.visible = true;
    this.shieldMesh.visible = true;
    this.innerGlow.visible = true;

    this.shieldMaterial.uniforms.uBreak.value = 0;
    this.shieldMaterial.uniforms.uExpand.value = 0;
    this.shieldMaterial.uniforms.uAlpha.value = 1;
    (this.innerGlow.material as THREE.MeshBasicMaterial).opacity = 0.22;

    for (const shard of this.shards) {
      shard.mesh.position.copy(shard.start);
      shard.mesh.rotation.copy(shard.baseRotation);
      shard.mesh.visible = false;
      (shard.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
      shard.mesh.scale.setScalar(1);
    }

    this.light.intensity = 4.2;
  }

  update(delta: number, camera?: THREE.Camera | null): void {
    if (this.age >= DURATION_SEC) {
      this.object.visible = false;
      return;
    }

    if (camera) {
      this.shieldMaterial.uniforms.uCameraPos.value.copy(camera.position);
    }

    this.age += delta;
    const t = this.age / DURATION_SEC;
    const fade = 1 - Math.pow(t, 1.25);
    const flash = Math.exp(-this.age * 4.8);
    const breakT = THREE.MathUtils.smoothstep(this.age, 0.04, 0.95);

    this.shieldMaterial.uniforms.uTime.value = this.age;
    this.shieldMaterial.uniforms.uBreak.value = breakT;
    this.shieldMaterial.uniforms.uExpand.value = THREE.MathUtils.smoothstep(this.age, 0.0, 0.35);
    this.shieldMaterial.uniforms.uAlpha.value = fade * (0.55 + flash * 0.65);

    const innerMat = this.innerGlow.material as THREE.MeshBasicMaterial;
    innerMat.opacity = (0.12 + flash * 0.18) * fade;
    this.innerGlow.scale.setScalar(1 + breakT * 0.18);

    this.light.intensity = 4.2 * flash + 0.45 * fade;

    for (const shard of this.shards) {
      const shardT = Math.max(0, this.age - shard.delay);
      if (shardT <= 0) {
        shard.mesh.visible = false;
        continue;
      }

      shard.mesh.visible = true;
      shard.mesh.position.copy(shard.start);
      shard.mesh.position.addScaledVector(shard.velocity, shardT);
      shard.mesh.rotation.copy(shard.baseRotation);
      shard.mesh.rotation.x += shard.spin.x * shardT;
      shard.mesh.rotation.y += shard.spin.y * shardT;
      shard.mesh.rotation.z += shard.spin.z * shardT;

      const shardFade = Math.max(0, 1 - shardT / 0.95);
      (shard.mesh.material as THREE.MeshBasicMaterial).opacity = shardFade * 0.95;
      const shardScale = 0.75 + shardFade * 0.45;
      shard.mesh.scale.setScalar(shardScale);
    }

    if (t > 0.92) {
      this.shieldMesh.visible = false;
      this.innerGlow.visible = false;
    }
  }

  dispose(): void {
    this.shieldMesh.geometry.dispose();
    this.shieldMaterial.dispose();
    this.innerGlow.geometry.dispose();
    (this.innerGlow.material as THREE.Material).dispose();
    this.shardGeometry.dispose();
    for (const shard of this.shards) {
      (shard.mesh.material as THREE.Material).dispose();
    }
    this.object.removeFromParent();
  }
}
