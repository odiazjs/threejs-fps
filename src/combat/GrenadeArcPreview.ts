import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import type { ArcPoint, GrenadeArcPreviewResult } from '../../shared/combat/grenadePhysics';

const MAX_CAPSULES = 64;
const DASH_LENGTH = 0.13;
const GAP_LENGTH = 0.085;
const ARC_START_SKIP = 0.02;
const CAPSULE_RADIUS = 0.022;
const CAPSULE_GEO_RADIUS = 0.5;
const CAPSULE_GEO_LENGTH = 1;
const CAPSULE_AXIS_LEN = CAPSULE_GEO_LENGTH + CAPSULE_GEO_RADIUS * 2;

const CYAN = MAP_PALETTE.neonCyan;
const CYAN_SOFT = 0x9ef6ff;

const HOLO = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
} as const;

interface CapsulePlacement {
  cx: number;
  cy: number;
  cz: number;
  tx: number;
  ty: number;
  tz: number;
  scale: number;
}

const _center = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _cameraPos = new THREE.Vector3();

function computeCumulativeLengths(points: readonly ArcPoint[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(
      cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
    );
  }
  return cumulative;
}

function sampleArcAtDistance(
  points: readonly ArcPoint[],
  cumulative: readonly number[],
  distAlong: number,
): CapsulePlacement {
  const total = cumulative[cumulative.length - 1] ?? 0;
  const d = THREE.MathUtils.clamp(distAlong, 0, total);

  for (let i = 1; i < points.length; i++) {
    const segStart = cumulative[i - 1]!;
    const segEnd = cumulative[i]!;
    if (d > segEnd + 1e-6) continue;

    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = segEnd - segStart;
    const t = segLen > 1e-6 ? (d - segStart) / segLen : 0;

    const prev = points[i - 2];
    const next = points[i + 1];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    let tz = b.z - a.z;
    if (prev && next) {
      tx = next.x - prev.x;
      ty = next.y - prev.y;
      tz = next.z - prev.z;
    }

    return {
      cx: a.x + (b.x - a.x) * t,
      cy: a.y + (b.y - a.y) * t,
      cz: a.z + (b.z - a.z) * t,
      tx,
      ty,
      tz,
      scale: 1,
    };
  }

  const last = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? last;
  return {
    cx: last.x,
    cy: last.y,
    cz: last.z,
    tx: last.x - prev.x,
    ty: last.y - prev.y,
    tz: last.z - prev.z,
    scale: 1,
  };
}

function buildCapsulePlacements(
  points: readonly ArcPoint[],
  cameraPos: THREE.Vector3,
): CapsulePlacement[] {
  const capsules: CapsulePlacement[] = [];
  if (points.length < 2) return capsules;

  const cumulative = computeCumulativeLengths(points);
  const totalLen = cumulative[cumulative.length - 1] ?? 0;

  let distAlong = ARC_START_SKIP;
  let onDash = true;
  let phaseProgress = 0;

  while (distAlong < totalLen && capsules.length < MAX_CAPSULES) {
    const phaseLen = onDash ? DASH_LENGTH : GAP_LENGTH;
    const step = Math.min(phaseLen - phaseProgress, totalLen - distAlong);

    if (onDash && step > 1e-4) {
      const sample = sampleArcAtDistance(points, cumulative, distAlong + step * 0.5);
      _center.set(sample.cx, sample.cy, sample.cz);
      const camDist = _center.distanceTo(cameraPos);
      sample.scale = THREE.MathUtils.clamp(0.72 + camDist * 0.055, 0.78, 1.28);
      capsules.push(sample);
    }

    distAlong += step;
    phaseProgress += step;
    if (phaseProgress >= phaseLen - 1e-6) {
      phaseProgress = 0;
      onDash = !onDash;
    }
  }

  return capsules;
}

/** Holographic segmented arc + ground impact rings for grenade throws. */
export class GrenadeArcPreview {
  readonly object = new THREE.Group();

  private readonly capsuleMesh: THREE.InstancedMesh;
  private readonly capsuleGlowMesh: THREE.InstancedMesh;
  private readonly impactDot: THREE.Mesh;
  private readonly impactCrossH: THREE.Mesh;
  private readonly impactCrossV: THREE.Mesh;
  private pulsePhase = 0;

  constructor(scene: THREE.Scene) {
    this.object.name = 'grenade-arc-preview';
    this.object.frustumCulled = false;
    this.object.visible = false;

    const capsuleGeo = new THREE.CapsuleGeometry(
      CAPSULE_GEO_RADIUS,
      CAPSULE_GEO_LENGTH,
      6,
      12,
    );

    this.capsuleMesh = new THREE.InstancedMesh(
      capsuleGeo,
      new THREE.MeshBasicMaterial({
        color: CYAN_SOFT,
        ...HOLO,
        opacity: 0.95,
      }),
      MAX_CAPSULES,
    );
    this.capsuleMesh.count = 0;
    this.capsuleMesh.frustumCulled = false;
    this.capsuleMesh.renderOrder = 14;

    this.capsuleGlowMesh = new THREE.InstancedMesh(
      capsuleGeo,
      new THREE.MeshBasicMaterial({
        color: CYAN,
        ...HOLO,
        opacity: 0.42,
      }),
      MAX_CAPSULES,
    );
    this.capsuleGlowMesh.count = 0;
    this.capsuleGlowMesh.frustumCulled = false;
    this.capsuleGlowMesh.renderOrder = 13;

    const crossMat = new THREE.MeshBasicMaterial({
      color: CYAN_SOFT,
      ...HOLO,
      opacity: 0.9,
    });

    this.impactCrossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.016, 0.016),
      crossMat,
    );
    this.impactCrossH.renderOrder = 12;
    this.impactCrossH.frustumCulled = false;

    this.impactCrossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.016, 0.38),
      crossMat.clone(),
    );
    this.impactCrossV.renderOrder = 12;
    this.impactCrossV.frustumCulled = false;

    this.impactDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 20),
      new THREE.MeshBasicMaterial({
        color: CYAN,
        ...HOLO,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    this.impactDot.rotation.x = -Math.PI / 2;
    this.impactDot.renderOrder = 11;
    this.impactDot.frustumCulled = false;

    this.object.add(this.capsuleGlowMesh);
    this.object.add(this.capsuleMesh);
    this.object.add(this.impactCrossH);
    this.object.add(this.impactCrossV);
    this.object.add(this.impactDot);
    scene.add(this.object);
  }

  update(
    visible: boolean,
    preview: GrenadeArcPreviewResult | null,
    cameraPos: THREE.Vector3 | null,
    delta = 0,
  ): void {
    const points = preview?.points ?? [];
    this.object.visible = visible && points.length >= 2;
    if (!this.object.visible || !preview) return;

    if (cameraPos) _cameraPos.copy(cameraPos);

    this.pulsePhase += delta * 3.4;
    const pulse = 0.86 + Math.sin(this.pulsePhase) * 0.14;

    const capsules = buildCapsulePlacements(points, _cameraPos);
    this.writeCapsuleInstances(this.capsuleMesh, capsules, 1, 0.95 * pulse);
    this.writeCapsuleInstances(this.capsuleGlowMesh, capsules, 2.15, 0.42 * pulse);

    const { impactX, impactZ, floorY } = preview;

    this.impactCrossH.position.set(impactX, floorY + 0.008, impactZ);
    this.impactCrossV.position.set(impactX, floorY + 0.008, impactZ);
    (this.impactCrossH.material as THREE.MeshBasicMaterial).opacity = 0.9 * pulse;
    (this.impactCrossV.material as THREE.MeshBasicMaterial).opacity = 0.9 * pulse;

    this.impactDot.position.set(impactX, floorY + 0.01, impactZ);
    (this.impactDot.material as THREE.MeshBasicMaterial).opacity = 0.95 * pulse;
  }

  private writeCapsuleInstances(
    mesh: THREE.InstancedMesh,
    capsules: readonly CapsulePlacement[],
    radiusMul: number,
    opacity: number,
  ): void {
    const count = Math.min(capsules.length, MAX_CAPSULES);
    mesh.count = count;
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;

    const radius = CAPSULE_RADIUS * radiusMul;
    const length = DASH_LENGTH * 0.92;

    for (let i = 0; i < count; i++) {
      const cap = capsules[i]!;
      _center.set(cap.cx, cap.cy, cap.cz);
      _tangent.set(cap.tx, cap.ty, cap.tz);
      if (_tangent.lengthSq() <= 1e-8) _tangent.set(0, 1, 0);
      _tangent.normalize();
      _quat.setFromUnitVectors(_yAxis, _tangent);

      const s = cap.scale;
      _scale.set(
        (radius / CAPSULE_GEO_RADIUS) * s,
        (length / CAPSULE_AXIS_LEN) * s,
        (radius / CAPSULE_GEO_RADIUS) * s,
      );
      _matrix.compose(_center, _quat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.capsuleMesh.geometry.dispose();
    (this.capsuleMesh.material as THREE.Material).dispose();
    this.capsuleGlowMesh.geometry.dispose();
    (this.capsuleGlowMesh.material as THREE.Material).dispose();
    this.impactCrossH.geometry.dispose();
    (this.impactCrossH.material as THREE.Material).dispose();
    this.impactCrossV.geometry.dispose();
    (this.impactCrossV.material as THREE.Material).dispose();
    this.impactDot.geometry.dispose();
    (this.impactDot.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
