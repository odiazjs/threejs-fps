import * as THREE from 'three';
import type { Aabb } from '../../shared/level/levelData';
import { isDebugFlagEnabled } from './debugQuery';

const debugRoots = new Set<THREE.Object3D>();

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

export function isVoxelColliderDebugEnabled(): boolean {
  return isDebugFlagEnabled('debugVoxelColliders');
}

export function setVoxelColliderDebugEnabled(enabled: boolean): void {
  if (enabled) {
    sessionStorage.setItem('debugVoxelColliders', '1');
  } else {
    sessionStorage.removeItem('debugVoxelColliders');
  }
  for (const root of debugRoots) {
    root.visible = enabled;
  }
}

function createDebugMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x44ff66,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false,
  });
}

/** Wireframe boxes matching level AABB collider volumes. */
export function createVoxelColliderDebugMesh(
  boxes: readonly Aabb[],
  label = 'colliders',
): THREE.Group {
  const enabled = isVoxelColliderDebugEnabled();
  const group = new THREE.Group();
  group.name = 'voxel-collider-debug';
  group.visible = enabled;
  group.renderOrder = 999;
  debugRoots.add(group);

  if (boxes.length === 0) {
    console.warn('[VoxelColliderDebug] No collider boxes to visualize');
    return group;
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = createDebugMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, boxes.length);
  mesh.name = 'voxel-collider-debug-mesh';
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]!;
    _position.set(
      (box.minX + box.maxX) * 0.5,
      (box.minY + box.maxY) * 0.5,
      (box.minZ + box.maxZ) * 0.5,
    );
    _scale.set(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
    _matrix.compose(_position, _quaternion, _scale);
    mesh.setMatrixAt(i, _matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  if (enabled) {
    console.info(`[VoxelColliderDebug] Showing ${boxes.length} ${label} boxes`);
  }

  return group;
}

export function attachVoxelColliderDebug(
  parent: THREE.Object3D,
  boxes: readonly Aabb[],
  label = 'colliders',
): THREE.Group {
  const group = createVoxelColliderDebugMesh(boxes, label);
  parent.add(group);
  return group;
}

export function disposeVoxelColliderDebugMesh(root: THREE.Object3D): void {
  debugRoots.delete(root);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    if (Array.isArray(child.material)) {
      for (const material of child.material) material.dispose();
    } else {
      child.material.dispose();
    }
  });
  root.removeFromParent();
}

if (typeof window !== 'undefined') {
  (
    window as Window & { setVoxelColliderDebugEnabled?: typeof setVoxelColliderDebugEnabled }
  ).setVoxelColliderDebugEnabled = setVoxelColliderDebugEnabled;
}
