import * as THREE from 'three';

const LOD_NAME = /LOD(\d+)/i;

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    mat.dispose();
  }
}

/**
 * FBX exports often embed every LOD level as sibling meshes (model_LOD0 … model_LOD4).
 * Rendering them together causes coplanar Z-fighting on textured surfaces.
 */
export function keepSingleFbxLodMesh(
  root: THREE.Object3D,
  preferredLod: number,
  options?: { collisionMeshName?: string },
): void {
  const lodMeshes: Array<{ mesh: THREE.Mesh; level: number; tris: number }> = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const match = child.name.match(LOD_NAME);
    if (!match) return;
    const tris = (child.geometry.index?.count ?? child.geometry.attributes.position.count) / 3;
    lodMeshes.push({
      mesh: child,
      level: Number.parseInt(match[1]!, 10),
      tris,
    });
  });

  if (lodMeshes.length <= 1) return;

  const availableLevels = lodMeshes.map((entry) => entry.level);
  const keepLevel = availableLevels.includes(preferredLod)
    ? preferredLod
    : availableLevels.reduce((best, level) => (level < best ? level : best));

  for (const { mesh, level } of lodMeshes) {
    if (level === keepLevel) {
      if (options?.collisionMeshName) {
        mesh.name = options.collisionMeshName;
      }
      continue;
    }
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
    disposeMaterial(mesh.material);
  }
}

/** Keep the lowest-poly LOD sibling — preferred source for gameplay collision. */
export function keepLowestPolyFbxLodMesh(
  root: THREE.Object3D,
  options?: { collisionMeshName?: string },
): number | null {
  const lodMeshes: Array<{ mesh: THREE.Mesh; level: number; tris: number }> = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const match = child.name.match(LOD_NAME);
    if (!match) return;
    const tris = (child.geometry.index?.count ?? child.geometry.attributes.position.count) / 3;
    lodMeshes.push({
      mesh: child,
      level: Number.parseInt(match[1]!, 10),
      tris,
    });
  });

  if (lodMeshes.length === 0) return null;
  if (lodMeshes.length === 1) {
    const only = lodMeshes[0]!;
    if (options?.collisionMeshName) {
      only.mesh.name = options.collisionMeshName;
    }
    return only.level;
  }

  const keep = lodMeshes.reduce((best, entry) => (entry.tris < best.tris ? entry : best));
  for (const { mesh, level } of lodMeshes) {
    if (level === keep.level) {
      mesh.name = options?.collisionMeshName ?? mesh.name;
      mesh.userData.collisionMesh = true;
      continue;
    }
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
    disposeMaterial(mesh.material);
  }

  return keep.level;
}
