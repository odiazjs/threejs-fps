import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

export const KATANA_SLASH_DURATION_SEC = 0.45;

const BLADE_SAMPLES = 14;
const ARC_SAMPLES = 28;
const EDGE_SPARK_COUNT = 40;

const CYAN = new THREE.Color(MAP_PALETTE.neonCyan);
const WHITE = new THREE.Color(0xffffff);

const FX_MATERIAL = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
  toneMapped: false,
} as const;

function slashEase(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function getWeaponMuzzle(weapon: THREE.Object3D): THREE.Object3D {
  return (weapon.userData.weaponMuzzle as THREE.Object3D | undefined)
    ?? weapon.getObjectByName('muzzle')
    ?? weapon;
}

function readBladeCameraSamples(
  weapon: THREE.Object3D,
  camera: THREE.Camera,
  samples: THREE.Vector3[],
  hiltScratch: THREE.Vector3,
  tipScratch: THREE.Vector3,
): number {
  weapon.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const content = weapon.getObjectByName('katanaContent') ?? weapon;
  const box = new THREE.Box3().setFromObject(content);
  getWeaponMuzzle(weapon).getWorldPosition(tipScratch);
  hiltScratch.set(
    (box.min.x + box.max.x) * 0.5,
    box.min.y,
    (box.min.z + box.max.z) * 0.5,
  );

  camera.worldToLocal(hiltScratch);
  camera.worldToLocal(tipScratch);

  for (let i = 0; i < samples.length; i++) {
    const t = i / (samples.length - 1);
    samples[i]!.copy(hiltScratch).lerp(tipScratch, t);
  }

  return hiltScratch.distanceTo(tipScratch);
}

/** First-person katana slash — half-moon crescent swept along the live blade. */
export class KatanaSlashTrailFx {
  readonly object = new THREE.Group();

  private age = KATANA_SLASH_DURATION_SEC;
  private readonly duration = KATANA_SLASH_DURATION_SEC;
  private active = false;
  private weapon: THREE.Object3D | null = null;

  private readonly crescentMesh: THREE.Mesh;
  private readonly crescentMaterial: THREE.MeshBasicMaterial;
  private readonly crescentGeometry: THREE.BufferGeometry;
  private readonly crescentPositions: Float32Array;
  private readonly crescentColors: Float32Array;

  private readonly glowMesh: THREE.Mesh;
  private readonly glowMaterial: THREE.MeshBasicMaterial;

  private readonly edgePositions: Float32Array;
  private readonly edgeColors: Float32Array;
  private readonly edgePoints: THREE.Points;

  private readonly bladeSamples: THREE.Vector3[] = Array.from(
    { length: BLADE_SAMPLES },
    () => new THREE.Vector3(),
  );
  private readonly innerArc: THREE.Vector3[] = Array.from(
    { length: ARC_SAMPLES },
    () => new THREE.Vector3(),
  );
  private readonly outerArc: THREE.Vector3[] = Array.from(
    { length: ARC_SAMPLES },
    () => new THREE.Vector3(),
  );

  private readonly hiltScratch = new THREE.Vector3();
  private readonly tipScratch = new THREE.Vector3();
  private readonly bloomDir = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  constructor() {
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.renderOrder = 20;

    const vertexCount = ARC_SAMPLES * 2;
    this.crescentPositions = new Float32Array(vertexCount * 3);
    this.crescentColors = new Float32Array(vertexCount * 3);
    this.crescentGeometry = new THREE.BufferGeometry();
    this.crescentGeometry.setAttribute('position', new THREE.BufferAttribute(this.crescentPositions, 3));
    this.crescentGeometry.setAttribute('color', new THREE.BufferAttribute(this.crescentColors, 3));

    const indices: number[] = [];
    for (let i = 0; i < ARC_SAMPLES - 1; i++) {
      const innerA = i * 2;
      const outerA = i * 2 + 1;
      const innerB = (i + 1) * 2;
      const outerB = (i + 1) * 2 + 1;
      indices.push(innerA, outerA, innerB, innerB, outerA, outerB);
    }
    this.crescentGeometry.setIndex(indices);

    this.crescentMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      ...FX_MATERIAL,
      opacity: 1,
    });
    this.crescentMesh = new THREE.Mesh(this.crescentGeometry, this.crescentMaterial);
    this.crescentMesh.frustumCulled = false;
    this.crescentMesh.renderOrder = 22;
    this.object.add(this.crescentMesh);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: MAP_PALETTE.neonCyan,
      side: THREE.DoubleSide,
      ...FX_MATERIAL,
      opacity: 0,
    });
    this.glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMaterial);
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 21;
    this.object.add(this.glowMesh);

    this.edgePositions = new Float32Array(EDGE_SPARK_COUNT * 3);
    this.edgeColors = new Float32Array(EDGE_SPARK_COUNT * 3);
    for (let i = 0; i < EDGE_SPARK_COUNT; i++) {
      const i3 = i * 3;
      const tone = CYAN.clone().lerp(WHITE, (i / (EDGE_SPARK_COUNT - 1)) * 0.8);
      this.edgeColors[i3] = tone.r;
      this.edgeColors[i3 + 1] = tone.g;
      this.edgeColors[i3 + 2] = tone.b;
    }

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(this.edgePositions, 3));
    edgeGeometry.setAttribute('color', new THREE.BufferAttribute(this.edgeColors, 3));

    this.edgePoints = new THREE.Points(
      edgeGeometry,
      new THREE.PointsMaterial({
        size: 0.11,
        vertexColors: true,
        ...FX_MATERIAL,
        opacity: 1,
        sizeAttenuation: false,
      }),
    );
    this.edgePoints.frustumCulled = false;
    this.edgePoints.renderOrder = 23;
    this.object.add(this.edgePoints);
  }

  /** Attach once to the local player camera. */
  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.object);
  }

  play(weapon: THREE.Object3D): void {
    this.weapon = weapon;
    this.age = 0;
    this.active = true;
    this.object.visible = true;
    this.tick(0);
  }

  update(delta: number): void {
    if (!this.active || !this.weapon) return;

    this.age += delta;
    const t = this.age / this.duration;
    if (t >= 1) {
      this.active = false;
      this.object.visible = false;
      this.weapon = null;
      return;
    }

    this.tick(t);
  }

  dispose(): void {
    this.crescentGeometry.dispose();
    this.crescentMaterial.dispose();
    this.glowMesh.geometry.dispose();
    this.glowMaterial.dispose();
    this.edgePoints.geometry.dispose();
    (this.edgePoints.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }

  private tick(t: number): void {
    if (!this.weapon) return;

    const camera = this.object.parent as THREE.Camera | null;
    if (!camera) return;

    const eased = slashEase(t);
    const bladeLength = readBladeCameraSamples(
      this.weapon,
      camera,
      this.bladeSamples,
      this.hiltScratch,
      this.tipScratch,
    );

    const bloom = Math.max(0.28, bladeLength * 0.85);
    const activeArcCount = Math.max(2, Math.ceil(eased * (ARC_SAMPLES - 1)) + 1);
    const slashLead = THREE.MathUtils.clamp(eased + 0.12, 0, 1);

    this.bloomDir.set(0, 0, -1);
    this.bloomDir.x += -0.42 * eased;

    for (let i = 0; i < ARC_SAMPLES; i++) {
      const arcT = i / (ARC_SAMPLES - 1);
      const bladeT = arcT * slashLead;
      const inner = this.sampleBladePoint(bladeT);
      const moon = Math.sin(arcT * Math.PI);
      const outerScale = moon * bloom * (0.65 + eased * 0.35);

      this.innerArc[i]!.copy(inner);
      this.outerArc[i]!.copy(inner).addScaledVector(this.bloomDir, outerScale);

      if (arcT <= 0.1) {
        this.outerArc[i]!.x += bloom * 0.06;
      }
    }

    this.writeCrescentGeometry(activeArcCount, eased, t);
    this.updateGlow(activeArcCount, bloom, eased, t);
    this.updateEdgeSparks(activeArcCount, eased, t);
  }

  private sampleBladePoint(t: number): THREE.Vector3 {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const scaled = clamped * (BLADE_SAMPLES - 1);
    const index = Math.floor(scaled);
    const frac = scaled - index;
    const a = this.bladeSamples[index]!;
    const b = this.bladeSamples[Math.min(index + 1, BLADE_SAMPLES - 1)]!;
    return this.scratch.copy(a).lerp(b, frac);
  }

  private writeCrescentGeometry(activeCount: number, eased: number, t: number): void {
    const fade = Math.max(0.15, (1 - t * 0.35) * Math.sin(Math.min(1, t * 1.45 + 0.08) * Math.PI));

    for (let i = 0; i < ARC_SAMPLES; i++) {
      const inner = this.innerArc[i]!;
      const outer = this.outerArc[i]!;
      const innerIdx = i * 6;
      const outerIdx = innerIdx + 3;
      const edgeMix = i / (ARC_SAMPLES - 1);
      const tone = CYAN.clone().lerp(WHITE, edgeMix * 0.85 + eased * 0.15);
      const rim = 0.45 + Math.sin(edgeMix * Math.PI) * 0.55;

      this.crescentPositions[innerIdx] = inner.x;
      this.crescentPositions[innerIdx + 1] = inner.y;
      this.crescentPositions[innerIdx + 2] = inner.z;
      this.crescentPositions[outerIdx] = outer.x;
      this.crescentPositions[outerIdx + 1] = outer.y;
      this.crescentPositions[outerIdx + 2] = outer.z;

      const innerStrength = i < activeCount ? 0.55 * rim : 0;
      const outerStrength = i < activeCount ? rim : 0;
      this.crescentColors[innerIdx] = tone.r * innerStrength;
      this.crescentColors[innerIdx + 1] = tone.g * innerStrength;
      this.crescentColors[innerIdx + 2] = tone.b * innerStrength;
      this.crescentColors[outerIdx] = tone.r * outerStrength;
      this.crescentColors[outerIdx + 1] = tone.g * outerStrength;
      this.crescentColors[outerIdx + 2] = tone.b * outerStrength;
    }

    this.crescentGeometry.setDrawRange(0, Math.max(6, (activeCount - 1) * 6));
    this.crescentGeometry.attributes.position!.needsUpdate = true;
    this.crescentGeometry.attributes.color!.needsUpdate = true;
    this.crescentMaterial.opacity = fade;
  }

  private updateGlow(activeCount: number, bloom: number, eased: number, t: number): void {
    const head = this.outerArc[Math.min(activeCount - 1, ARC_SAMPLES - 1)]!;
    const tail = this.innerArc[0]!;
    const center = this.scratch.copy(tail).lerp(head, 0.55);

    this.glowMesh.position.copy(center);
    this.glowMesh.rotation.set(0, 0, 0);

    const span = Math.max(0.12, tail.distanceTo(head));
    this.glowMesh.scale.set(span * 1.35, bloom * 1.55, 1);
    this.glowMaterial.opacity =
      0.35 * (1 - t * 0.45) * Math.sin(Math.min(1, t * 1.35 + 0.1) * Math.PI) * (0.35 + eased * 0.65);
  }

  private updateEdgeSparks(activeCount: number, eased: number, t: number): void {
    const fade = Math.max(0.2, (1 - t * 0.35) * Math.sin(Math.min(1, t * 1.55 + 0.08) * Math.PI));
    const edgeMaterial = this.edgePoints.material as THREE.PointsMaterial;
    edgeMaterial.opacity = fade;
    edgeMaterial.size = 0.08 + eased * 0.07;

    for (let i = 0; i < EDGE_SPARK_COUNT; i++) {
      const i3 = i * 3;
      const arcIndex = Math.floor((i / (EDGE_SPARK_COUNT - 1)) * Math.max(1, activeCount - 1));
      const outer = this.outerArc[arcIndex]!;
      const inner = this.innerArc[arcIndex]!;
      const mix = (i % 4) / 4;
      const jitter = (Math.sin(i * 2.17 + t * 18) * 0.5 + 0.5) * (0.25 + eased * 0.75);

      this.edgePositions[i3] = THREE.MathUtils.lerp(inner.x, outer.x, 0.5 + mix * 0.45) + jitter * 0.018;
      this.edgePositions[i3 + 1] = THREE.MathUtils.lerp(inner.y, outer.y, 0.5 + mix * 0.45) + jitter * 0.014;
      this.edgePositions[i3 + 2] = THREE.MathUtils.lerp(inner.z, outer.z, 0.45 + mix * 0.35) - jitter * 0.006;
    }

    this.edgePoints.geometry.attributes.position!.needsUpdate = true;
  }
}
