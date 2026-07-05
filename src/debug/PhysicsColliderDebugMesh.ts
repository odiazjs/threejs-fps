import * as THREE from 'three';
import type { Aabb } from '../../shared/level/levelData';
import { SHOW_PHYSICS_COLLIDER_DEBUG } from './debugConfig';

const TRIMESH_COLOR = 0x3dffa8;
const AABB_COLOR = 0xffa53d;

export function isPhysicsColliderDebugEnabled(): boolean {
  return SHOW_PHYSICS_COLLIDER_DEBUG;
}

/** Wireframe overlay matching the Rapier trimesh collider exactly. */
export function createTrimeshColliderDebugMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: TRIMESH_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = 'physics-collider-debug-trimesh';
  mesh.renderOrder = 20;
  mesh.frustumCulled = false;
  mesh.userData.colliderDebug = true;
  return mesh;
}

/** Wireframe boxes for AABB map collision. */
export function createAabbColliderDebugGroup(boxes: readonly Aabb[]): THREE.Group {
  const root = new THREE.Group();
  root.name = 'physics-collider-debug-aabbs';

  const material = new THREE.MeshBasicMaterial({
    color: AABB_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]!;
    const sizeX = box.maxX - box.minX;
    const sizeY = box.maxY - box.minY;
    const sizeZ = box.maxZ - box.minZ;
    if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) continue;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
      material.clone(),
    );
    mesh.position.set(
      (box.minX + box.maxX) * 0.5,
      (box.minY + box.maxY) * 0.5,
      (box.minZ + box.maxZ) * 0.5,
    );
    mesh.name = `physics-collider-debug-aabb-${i}`;
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
    mesh.userData.colliderDebug = true;
    root.add(mesh);
  }

  material.dispose();
  return root;
}

export function disposePhysicsColliderDebugMesh(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}
