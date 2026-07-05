import * as THREE from 'three';
import { SHOW_MESH_BVH_COLLIDER_DEBUG } from './debugConfig';

const debugRoots = new Set<THREE.Object3D>();

export function isMeshBvhColliderDebugEnabled(): boolean {
  return SHOW_MESH_BVH_COLLIDER_DEBUG;
}

function createFillMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.4,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
}

function createWireMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

/** One world-space debug overlay per source mesh — same triangles as the visible model. */
export function attachMeshBvhColliderDebug(
  parent: THREE.Object3D,
  sourceMeshes: readonly THREE.Mesh[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mesh-bvh-collider-debug';
  group.renderOrder = 10000;
  group.frustumCulled = false;

  let triangleCount = 0;

  for (const source of sourceMeshes) {
    source.updateWorldMatrix(true, false);

    const fill = new THREE.Mesh(source.geometry, createFillMaterial());
    fill.applyMatrix4(source.matrixWorld);
    fill.matrixAutoUpdate = false;
    fill.renderOrder = 10000;
    fill.frustumCulled = false;
    fill.userData.colliderDebug = true;

    const wire = new THREE.Mesh(source.geometry, createWireMaterial());
    wire.applyMatrix4(source.matrixWorld);
    wire.matrixAutoUpdate = false;
    wire.renderOrder = 10001;
    wire.frustumCulled = false;
    wire.userData.colliderDebug = true;

    group.add(fill, wire);
    triangleCount += (source.geometry.index?.count ?? source.geometry.attributes.position.count) / 3;
  }

  parent.add(group);
  debugRoots.add(group);

  console.info(
    `[MeshBvhColliderDebug] Attached ${sourceMeshes.length} model overlays (${Math.round(triangleCount)} tris)`,
  );

  return group;
}

export function disposeMeshBvhColliderDebugMesh(root: THREE.Object3D): void {
  debugRoots.delete(root);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material.dispose();
    }
  });
  root.removeFromParent();
}
