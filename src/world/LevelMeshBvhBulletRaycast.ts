import * as THREE from 'three';
import { MeshBVH, StaticGeometryGenerator } from 'three-mesh-bvh';
import type { RaycastHit } from '../../shared/level/collision';

const _ray = new THREE.Ray();

function isBulletRaycastMesh(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh)) return false;
  if (!object.visible) return false;
  if (object.name === 'voxel-collider-debug-mesh') return false;
  if (object.parent?.name === 'voxel-collider-debug') return false;

  const positions = object.geometry?.attributes?.position;
  return Boolean(positions && positions.count >= 3);
}

function collectBulletMeshes(roots: readonly THREE.Object3D[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((child) => {
      if (isBulletRaycastMesh(child)) {
        meshes.push(child);
      }
    });
  }

  return meshes;
}

/** Client-only merged mesh BVH for accurate bullet hits against visible level geometry. */
export class LevelMeshBvhBulletRaycast {
  private bvh: MeshBVH | null = null;
  private geometry: THREE.BufferGeometry | null = null;

  get isReady(): boolean {
    return this.bvh !== null;
  }

  rebuild(roots: readonly THREE.Object3D[]): void {
    this.dispose();

    const meshes = collectBulletMeshes(roots);
    if (meshes.length === 0) {
      console.warn('[LevelMeshBvh] No meshes found for bullet BVH');
      return;
    }

    const generator = new StaticGeometryGenerator(meshes);
    generator.useGroups = false;
    generator.applyWorldTransforms = true;

    this.geometry = generator.generate();
    this.bvh = new MeshBVH(this.geometry);

    const triangleCount = (this.geometry.index?.count ?? this.geometry.attributes.position.count) / 3;
    console.info(
      `[LevelMeshBvh] Built bullet BVH from ${meshes.length} meshes (${Math.round(triangleCount)} tris)`,
    );
  }

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    minDistance = 0,
  ): RaycastHit | null {
    if (!this.bvh) return null;

    _ray.origin.set(ox, oy, oz);
    _ray.direction.set(dx, dy, dz).normalize();

    const hit = this.bvh.raycastFirst(_ray, undefined, minDistance, maxDistance);
    if (!hit) return null;

    return {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
      distance: hit.distance,
    };
  }

  dispose(): void {
    this.bvh = null;
    this.geometry?.dispose();
    this.geometry = null;
  }
}
