import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _centroid = new THREE.Vector3();
const _edge1 = new THREE.Vector3();
const _edge2 = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _triBox = new THREE.Box3();

export interface ShellCollisionOptions {
  /** Inset from bounds used to detect walkable interior (auto if omitted). */
  wallThickness?: number;
}

export interface WorldTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  centroid: THREE.Vector3;
}

/** Mark a prop root as gameplay collision geometry (no interior shell stripping). */
export function markLodCollisionMesh(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.userData.collisionMesh = true;
    }
  });
}

/** Mark a prop root as an invisible LOD collision source (shell extraction at merge time). */
export function markLodCollisionShell(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.userData.collisionMesh = true;
      child.userData.shellCollision = true;
    }
  });
}

function estimateWallThickness(bounds: THREE.Box3): number {
  const size = bounds.getSize(new THREE.Vector3());
  const horizontal = Math.min(size.x, size.z);
  return THREE.MathUtils.clamp(horizontal * 0.08, 0.12, 0.35);
}

function triangleNormalY(tri: WorldTriangle): number {
  _edge1.subVectors(tri.b, tri.a);
  _edge2.subVectors(tri.c, tri.a);
  return Math.abs(_normal.crossVectors(_edge1, _edge2).normalize().y);
}

function triangleBounds(tri: WorldTriangle): THREE.Box3 {
  return _triBox.setFromPoints([tri.a, tri.b, tri.c]);
}

function overlapsInteriorFootprintXZ(box: THREE.Box3, interior: THREE.Box3): boolean {
  return !(
    box.max.x < interior.min.x ||
    box.min.x > interior.max.x ||
    box.max.z < interior.min.z ||
    box.min.z > interior.max.z
  );
}

function isInteriorHorizontalSlab(
  tri: WorldTriangle,
  bounds: THREE.Box3,
  interior: THREE.Box3,
  wall: number,
  hullBounds: THREE.Box3,
): boolean {
  if (triangleNormalY(tri) < 0.65) return false;
  if (!overlapsInteriorFootprintXZ(bounds, interior)) return false;

  const thickness = bounds.max.y - bounds.min.y;
  const bottomCapTop = hullBounds.min.y + 0.05;
  const raisedWalkFloor = hullBounds.min.y + 0.06;
  const floorBandTop = interior.min.y + wall * 1.25;
  const ceilingBandBottom = interior.max.y - wall * 1.25;

  // Bottom caps at hull ymin are not the walk surface on enterable props.
  if (bounds.max.y <= bottomCapTop) return true;

  // Keep the raised interior floor slab.
  if (bounds.min.y >= raisedWalkFloor && bounds.max.y <= floorBandTop) return false;

  if (bounds.max.y <= floorBandTop) return true;
  if (bounds.min.y >= ceilingBandBottom) return true;

  if (
    thickness < 0.2 &&
    bounds.min.y > interior.min.y + 0.06 &&
    bounds.max.y < interior.max.y - 0.06
  ) {
    return true;
  }

  return false;
}

/**
 * Drop interior floor/ceiling/shelf slabs from pre-authored collision hulls.
 * Unlike shell extraction, keeps all wall faces (including inner surfaces).
 */
export function filterInteriorHorizontalSlabs(
  triangles: readonly WorldTriangle[],
  options: ShellCollisionOptions = {},
): WorldTriangle[] {
  if (triangles.length === 0) return [];

  const bounds = new THREE.Box3();
  for (const tri of triangles) {
    bounds.expandByPoint(tri.a);
    bounds.expandByPoint(tri.b);
    bounds.expandByPoint(tri.c);
  }

  const wall = options.wallThickness ?? estimateWallThickness(bounds);
  const interior = bounds.clone();
  interior.min.x += wall;
  interior.max.x -= wall;
  interior.min.z += wall;
  interior.max.z -= wall;
  interior.min.y += 0.05;
  interior.max.y -= Math.min(wall, 0.2);

  const kept: WorldTriangle[] = [];
  for (const tri of triangles) {
    const triBounds = triangleBounds(tri);
    if (isInteriorHorizontalSlab(tri, triBounds, interior, wall, bounds)) {
      continue;
    }
    kept.push(tri);
  }

  return kept.length > 0 ? kept : triangles;
}

/**
 * Remove solid interior faces from closed LOD props so characters can walk inside.
 * Keeps only the exterior shell band; door/window openings come from mesh gaps.
 */
export function filterShellCollisionTriangles(
  triangles: readonly WorldTriangle[],
  options: ShellCollisionOptions = {},
): WorldTriangle[] {
  if (triangles.length === 0) return [];

  const bounds = new THREE.Box3();
  for (const tri of triangles) {
    bounds.expandByPoint(tri.a);
    bounds.expandByPoint(tri.b);
    bounds.expandByPoint(tri.c);
  }

  const wall = options.wallThickness ?? estimateWallThickness(bounds);
  const interior = bounds.clone();
  interior.min.x += wall;
  interior.max.x -= wall;
  interior.min.z += wall;
  interior.max.z -= wall;
  interior.min.y += 0.05;
  interior.max.y -= Math.min(wall, 0.2);

  const kept: WorldTriangle[] = [];
  for (const tri of triangles) {
    const triBounds = triangleBounds(tri);

    if (interior.containsPoint(tri.centroid)) {
      continue;
    }

    if (isInteriorHorizontalSlab(tri, triBounds, interior, wall, bounds)) {
      continue;
    }

    kept.push(tri);
  }

  return kept.length > 0 ? kept : triangles;
}

/** Extract world-space triangles from a mesh (indexed or non-indexed). */
export function extractWorldTriangles(mesh: THREE.Mesh): WorldTriangle[] {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position) return [];

  const index = geometry.index;
  const triCount = (index?.count ?? position.count) / 3;
  const triangles: WorldTriangle[] = [];

  for (let t = 0; t < triCount; t++) {
    const i = t * 3;
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;

    _a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
    _b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
    _c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
    _centroid.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);

    triangles.push({
      a: _a.clone(),
      b: _b.clone(),
      c: _c.clone(),
      centroid: _centroid.clone(),
    });
  }

  return triangles;
}

export function appendTrianglesToBuffers(
  triangles: readonly WorldTriangle[],
  positions: Float32Array,
  indices: Uint32Array,
  vertexOffset: number,
  indexOffset: number,
): { vertexOffset: number; indexOffset: number } {
  let vOffset = vertexOffset;
  let iOffset = indexOffset;

  for (const tri of triangles) {
    const verts = [tri.a, tri.b, tri.c];
    const base = vOffset;
    for (let v = 0; v < 3; v++) {
      const p = verts[v]!;
      const baseIndex = (vOffset + v) * 3;
      positions[baseIndex] = p.x;
      positions[baseIndex + 1] = p.y;
      positions[baseIndex + 2] = p.z;
    }
    indices[iOffset] = base;
    indices[iOffset + 1] = base + 1;
    indices[iOffset + 2] = base + 2;
    vOffset += 3;
    iOffset += 3;
  }

  return { vertexOffset: vOffset, indexOffset: iOffset };
}

export function countMergedTriangleCapacity(meshes: readonly THREE.Mesh[]): {
  vertices: number;
  indices: number;
} {
  let vertices = 0;
  let indices = 0;

  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    if (!position) continue;
    if (mesh.userData.shellCollision === true || mesh.userData.collisionMesh === true) {
      const triCount = (mesh.geometry.index?.count ?? position.count) / 3;
      vertices += triCount * 3;
      indices += triCount * 3;
      continue;
    }
    vertices += position.count;
    indices += mesh.geometry.index?.count ?? position.count;
  }

  return { vertices, indices };
}
