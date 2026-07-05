import * as THREE from 'three';
import { staticBodyPartPose, volumeToCapsulePose, type BodyPartCapsulePose } from '../../shared/combat/bodyPartPose';
import type { BodyPartVolume } from '../../shared/combat/bodyPartVolumes';
import { BODY_PARTS, type BodyPartId } from '../../shared/combat/bodyParts';
import { SHOW_HIT_CAPSULE_DEBUG } from '../debug/debugConfig';

/** Max capsules: feet + 2 legs + torso + up to 6 arm segments + head. */
const MAX_DEBUG_VOLUMES = 11;

const PART_COLORS: Record<BodyPartId, number> = {
  head: 0xff5a5a,
  torso: 0x3dff9a,
  arms: 0xffd93d,
  legs: 0x5ab0ff,
  feet: 0xc89bff,
};

const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _point = new THREE.Vector3();

export function isHitCapsuleDebugEnabled(): boolean {
  return SHOW_HIT_CAPSULE_DEBUG;
}

function volumeLabel(index: number): string {
  return `hit-capsule-${index}`;
}

function createCapsuleGeometry(radius: number, height: number): THREE.CapsuleGeometry {
  const cylLength = Math.max(0, height - radius * 2);
  return new THREE.CapsuleGeometry(radius, cylLength, 4, 12);
}

function createPartCapsuleMesh(color: number, label: string): THREE.Group {
  const group = new THREE.Group();
  group.name = label;

  const fill = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.1, 0.1, 4, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(fill.geometry),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  group.add(fill);
  group.add(outline);
  return group;
}

function setCapsulePose(group: THREE.Group, pose: BodyPartCapsulePose): void {
  const fill = group.children[0] as THREE.Mesh;
  const outline = group.children[1] as THREE.LineSegments;
  const nextGeometry = createCapsuleGeometry(pose.radius, pose.height);

  fill.geometry.dispose();
  outline.geometry.dispose();
  fill.geometry = nextGeometry;
  outline.geometry = new THREE.EdgesGeometry(nextGeometry);

  group.position.set(pose.centerX, pose.centerY, pose.centerZ);
  group.rotation.set(0, 0, 0);
  group.visible = true;

  if (
    pose.axisAx !== undefined
    && pose.axisAy !== undefined
    && pose.axisAz !== undefined
    && pose.axisBx !== undefined
    && pose.axisBy !== undefined
    && pose.axisBz !== undefined
  ) {
    _axis.set(
      pose.axisBx - pose.axisAx,
      pose.axisBy - pose.axisAy,
      pose.axisBz - pose.axisAz,
    );
    if (_axis.lengthSq() > 1e-8) {
      _axis.normalize();
      _quat.setFromUnitVectors(_up, _axis);
      group.quaternion.copy(_quat);
    }
  }
}

function volumeToLocalPose(vol: BodyPartVolume, space: THREE.Object3D): BodyPartCapsulePose {
  _point.set(vol.ax, vol.ay, vol.az);
  space.worldToLocal(_point);
  const ax = _point.x;
  const ay = _point.y;
  const az = _point.z;

  _point.set(vol.bx, vol.by, vol.bz);
  space.worldToLocal(_point);

  return volumeToCapsulePose({
    part: vol.part,
    ax,
    ay,
    az,
    bx: _point.x,
    by: _point.y,
    bz: _point.z,
    radius: vol.radius,
  });
}

function staticFallbackPoses(): BodyPartCapsulePose[] {
  const poses: BodyPartCapsulePose[] = [];
  for (const part of BODY_PARTS) {
    if (part.id === 'arms' || part.id === 'legs') {
      poses.push(staticBodyPartPose(part, -1));
      poses.push(staticBodyPartPose(part, 1));
      continue;
    }
    poses.push(staticBodyPartPose(part));
  }
  return poses;
}

const fallbackParts: BodyPartId[] = ['feet', 'legs', 'legs', 'torso', 'arms', 'arms', 'head'];

export function createHitCapsuleDebugMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'hit-capsule-debug';

  const fallback = staticFallbackPoses();
  for (let i = 0; i < MAX_DEBUG_VOLUMES; i++) {
    const partId = fallbackParts[i] ?? 'arms';
    const mesh = createPartCapsuleMesh(PART_COLORS[partId], volumeLabel(i));
    const fallbackPose = fallback[i];
    if (fallbackPose) setCapsulePose(mesh, fallbackPose);
    else mesh.visible = false;
    root.add(mesh);
  }

  root.renderOrder = 10;
  return root;
}

function findDebugPart(root: THREE.Group, name: string): THREE.Group | null {
  return root.children.find((child) => child.name === name) as THREE.Group | null;
}

/** Sync debug meshes from the same world-space volumes used for hit tests. */
export function updateHitCapsuleDebugMesh(
  root: THREE.Group,
  worldVolumes: readonly BodyPartVolume[] | null,
  localSpace: THREE.Object3D,
): void {
  const poses = worldVolumes
    ? worldVolumes.map((vol) => volumeToLocalPose(vol, localSpace))
    : staticFallbackPoses();

  for (let i = 0; i < MAX_DEBUG_VOLUMES; i++) {
    const mesh = findDebugPart(root, volumeLabel(i));
    if (!mesh) continue;

    const pose = poses[i];
    if (!pose) {
      mesh.visible = false;
      continue;
    }

    const fill = mesh.children[0] as THREE.Mesh;
    const color = PART_COLORS[worldVolumes?.[i]?.part ?? fallbackParts[i] ?? 'torso'];
    (fill.material as THREE.MeshBasicMaterial).color.setHex(color);
    ((mesh.children[1] as THREE.LineSegments).material as THREE.LineBasicMaterial).color.setHex(color);

    setCapsulePose(mesh, pose);
  }
}
