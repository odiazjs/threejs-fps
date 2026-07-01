import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

const DURATION_SEC = 0.32;
const SPARK_COUNT = 14;
const MAX_SPHERE_RADIUS = 0.62;

const CYAN = new THREE.Color(MAP_PALETTE.neonCyan);
const WHITE = new THREE.Color(0xffffff);

const FX = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
} as const;

/** Flashy melee impact — fast-growing sphere + burst particles. */
export class MeleeHitFx {
  readonly object = new THREE.Group();

  private age = DURATION_SEC;
  private readonly core: THREE.Mesh;
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly glow: THREE.Mesh;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  private readonly sparks: THREE.Points;
  private readonly sparkPositions: Float32Array;
  private readonly sparkVelocities: THREE.Vector3[] = [];

  constructor() {
    this.object.visible = false;
    this.object.frustumCulled = false;

    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: WHITE,
      ...FX,
      opacity: 1,
    });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.coreMaterial);
    this.object.add(this.core);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: MAP_PALETTE.neonCyan,
      ...FX,
      opacity: 0.85,
    });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), this.glowMaterial);
    this.object.add(this.glow);

    this.light = new THREE.PointLight(MAP_PALETTE.neonCyan, 0, 2.8);
    this.light.decay = 2;
    this.object.add(this.light);

    this.sparkPositions = new Float32Array(SPARK_COUNT * 3);
    const sparkColors = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const i3 = i * 3;
      const tone = CYAN.clone().lerp(WHITE, Math.random() * 0.85);
      sparkColors[i3] = tone.r;
      sparkColors[i3 + 1] = tone.g;
      sparkColors[i3 + 2] = tone.b;
      this.sparkVelocities.push(new THREE.Vector3());
    }

    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));

    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        ...FX,
        opacity: 1,
        sizeAttenuation: true,
      }),
    );
    this.object.add(this.sparks);
  }

  play(localPoint: THREE.Vector3): void {
    this.age = 0;
    this.object.visible = true;
    this.object.position.copy(localPoint);

    for (let i = 0; i < SPARK_COUNT; i++) {
      const i3 = i * 3;
      this.sparkPositions[i3] = 0;
      this.sparkPositions[i3 + 1] = 0;
      this.sparkPositions[i3 + 2] = 0;
      this.sparkVelocities[i]!
        .set(
          (Math.random() - 0.5) * 2,
          Math.random() * 1.4 + 0.4,
          (Math.random() - 0.5) * 2,
        )
        .normalize()
        .multiplyScalar(2.8 + Math.random() * 2.2);
    }

    this.core.scale.setScalar(0.02);
    this.glow.scale.setScalar(0.02);
    this.coreMaterial.opacity = 1;
    this.glowMaterial.opacity = 0.9;
    this.light.intensity = 3.2;
  }

  update(delta: number, _camera: THREE.Camera): boolean {
    if (this.age >= DURATION_SEC) {
      this.object.visible = false;
      return false;
    }

    this.age += delta;
    const t = this.age / DURATION_SEC;
    const grow = 1 - Math.pow(1 - Math.min(1, t * 1.35), 3);
    const fade = Math.pow(1 - t, 1.6);

    const radius = MAX_SPHERE_RADIUS * grow;
    this.core.scale.setScalar(radius * 0.42);
    this.glow.scale.setScalar(radius);
    this.coreMaterial.opacity = fade;
    this.glowMaterial.opacity = fade * 0.75;
    this.light.intensity = 3.5 * fade * (1 - t * 0.4);

    const sparkFade = fade * (1 - t * 0.25);
    (this.sparks.material as THREE.PointsMaterial).opacity = sparkFade;

    for (let i = 0; i < SPARK_COUNT; i++) {
      const i3 = i * 3;
      const velocity = this.sparkVelocities[i]!;
      this.sparkPositions[i3] += velocity.x * delta;
      this.sparkPositions[i3 + 1] += velocity.y * delta;
      this.sparkPositions[i3 + 2] += velocity.z * delta;
      velocity.multiplyScalar(1 - delta * 4.2);
    }
    this.sparks.geometry.attributes.position!.needsUpdate = true;

    return true;
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.coreMaterial.dispose();
    this.glow.geometry.dispose();
    this.glowMaterial.dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
