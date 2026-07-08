import * as THREE from 'three';

const DURATION_SEC = 0.55;
const SPARK_COUNT = 36;
const MAX_SPHERE_RADIUS = 2.4;

const ORANGE = new THREE.Color(0xff6622);
const YELLOW = new THREE.Color(0xffcc44);
const WHITE = new THREE.Color(0xffffff);

const FX = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
} as const;

/** Grenade detonation burst — expanding sphere, sparks, and flash light. */
export class ExplosionFx {
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
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), this.coreMaterial);
    this.object.add(this.core);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: ORANGE,
      ...FX,
      opacity: 0.9,
    });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.glowMaterial);
    this.object.add(this.glow);

    this.light = new THREE.PointLight(0xff6622, 0, 8);
    this.light.decay = 2;
    this.object.add(this.light);

    this.sparkPositions = new Float32Array(SPARK_COUNT * 3);
    const sparkColors = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const i3 = i * 3;
      const tone = ORANGE.clone().lerp(YELLOW, Math.random()).lerp(WHITE, Math.random() * 0.5);
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
        size: 0.18,
        vertexColors: true,
        ...FX,
        opacity: 1,
        sizeAttenuation: true,
      }),
    );
    this.object.add(this.sparks);
  }

  play(worldX: number, worldY: number, worldZ: number): void {
    this.object.position.set(worldX, worldY, worldZ);
    this.object.visible = true;
    this.age = 0;

    for (let i = 0; i < SPARK_COUNT; i++) {
      const vel = this.sparkVelocities[i]!;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2.5 + Math.random() * 5.5;
      vel.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed * 0.85 + Math.random() * 2,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      const i3 = i * 3;
      this.sparkPositions[i3] = 0;
      this.sparkPositions[i3 + 1] = 0;
      this.sparkPositions[i3 + 2] = 0;
    }
    this.sparks.geometry.attributes.position!.needsUpdate = true;
  }

  update(delta: number): boolean {
    if (this.age >= DURATION_SEC) {
      this.object.visible = false;
      return false;
    }

    this.age += delta;
    const t = this.age / DURATION_SEC;
    const grow = THREE.MathUtils.smoothstep(t, 0, 0.35);
    const fade = 1 - THREE.MathUtils.smoothstep(t, 0.25, 1);

    const radius = MAX_SPHERE_RADIUS * grow;
    this.core.scale.setScalar(radius * 0.55);
    this.glow.scale.setScalar(radius);
    this.coreMaterial.opacity = fade;
    this.glowMaterial.opacity = fade * 0.85;
    this.light.intensity = fade * 3.2;

    for (let i = 0; i < SPARK_COUNT; i++) {
      const vel = this.sparkVelocities[i]!;
      vel.y -= 10 * delta;
      const i3 = i * 3;
      this.sparkPositions[i3]! += vel.x * delta;
      this.sparkPositions[i3 + 1]! += vel.y * delta;
      this.sparkPositions[i3 + 2]! += vel.z * delta;
    }
    this.sparks.geometry.attributes.position!.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).opacity = fade;

    return true;
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.coreMaterial.dispose();
    this.glow.geometry.dispose();
    this.glowMaterial.dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
  }
}
