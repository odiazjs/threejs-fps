import * as THREE from 'three';
import {
  appendTrianglesToBuffers,
  countMergedTriangleCapacity,
  extractWorldTriangles,
  filterShellCollisionTriangles,
  isThreeMesh,
} from './collisionMeshPrep.js';

const PROXY_MESH_NAME = /(?:^|[\s_-])(?:lodbox|lod\d+|ucx\d*|ubx|collision|collider|proxy)(?:[\s_-]|$)/i;
const _proxyWorldBox = new THREE.Box3();
const _proxyWorldSize = new THREE.Vector3();
const _mergeVertex = new THREE.Vector3();

/** Decorative meshes (energy fields, glass) should not block bullets or movement. */
function meshMaterialBlocksCollision(mesh: THREE.Mesh): boolean {
  if (mesh.userData.skipCollision === true) return false;
  if (mesh.userData.collisionMesh === true) return true;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material) continue;
    if (material.transparent && material.opacity < 0.9) return false;
  }

  return true;
}

/** FBX props often include a low-poly LOD / UCX hull — not part of the visible model. */
function isEmbeddedProxyHull(mesh: THREE.Mesh): boolean {
  if (mesh.userData.collisionMesh === true) return false;

  const label = `${mesh.name} ${mesh.parent?.name ?? ''}`;
  if (PROXY_MESH_NAME.test(label)) return true;

  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position) return false;

  const triangleCount = (geometry.index?.count ?? position.count) / 3;
  if (triangleCount > 24) return false;

  _proxyWorldBox.setFromObject(mesh);
  _proxyWorldBox.getSize(_proxyWorldSize);
  const dims = [_proxyWorldSize.x, _proxyWorldSize.y, _proxyWorldSize.z]
    .map(Math.abs)
    .sort((a, b) => a - b);
  const [smallest, middle, largest] = dims;

  if (smallest < 0.25 && largest > 8) return false;

  return largest > 0.4 && middle > 0.25 && smallest > 0.15;
}

export function isLevelCollisionMesh(object: THREE.Object3D): object is THREE.Mesh {
  if (!isThreeMesh(object)) return false;
  if (!object.visible && object.userData.collisionMesh !== true) return false;
  if (object.userData.colliderDebug) return false;
  if (!meshMaterialBlocksCollision(object)) return false;
  if (isEmbeddedProxyHull(object)) return false;

  const positions = object.geometry?.attributes?.position;
  return Boolean(positions && positions.count >= 3);
}

export function collectLevelCollisionMeshes(roots: readonly THREE.Object3D[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((child) => {
      if (isLevelCollisionMesh(child)) {
        meshes.push(child);
      }
    });
  }

  return meshes;
}

/** Merge collected level meshes into one indexed world-space geometry for MeshBVH. */
export function buildMergedLevelCollisionGeometry(meshes: readonly THREE.Mesh[]): THREE.BufferGeometry {
  const { vertices, indices } = countMergedTriangleCapacity(meshes);

  const positions = new Float32Array(vertices * 3);
  const indexData = new Uint32Array(indices);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const mesh of meshes) {
    if (mesh.userData.shellCollision === true) {
      const worldTriangles = extractWorldTriangles(mesh);
      const shellTriangles = filterShellCollisionTriangles(worldTriangles);
      ({ vertexOffset, indexOffset } = appendTrianglesToBuffers(
        shellTriangles,
        positions,
        indexData,
        vertexOffset,
        indexOffset,
      ));
      continue;
    }

    if (mesh.userData.collisionMesh === true) {
      const worldTriangles = extractWorldTriangles(mesh);
      // Editor-exported map meshes are solid collision as authored — do not strip
      // interior horizontal faces (that pass is for hollow FBX LOD props only).
      ({ vertexOffset, indexOffset } = appendTrianglesToBuffers(
        worldTriangles,
        positions,
        indexData,
        vertexOffset,
        indexOffset,
      ));
      continue;
    }

    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const flipWinding = mesh.matrixWorld.determinant() < 0;

    for (let i = 0; i < position.count; i++) {
      _mergeVertex.fromBufferAttribute(position, i);
      _mergeVertex.applyMatrix4(mesh.matrixWorld);
      const base = (vertexOffset + i) * 3;
      positions[base] = _mergeVertex.x;
      positions[base + 1] = _mergeVertex.y;
      positions[base + 2] = _mergeVertex.z;
    }

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = vertexOffset + index.getX(i);
        const b = vertexOffset + index.getX(i + 1);
        const c = vertexOffset + index.getX(i + 2);
        if (flipWinding) {
          indexData[indexOffset + i] = a;
          indexData[indexOffset + i + 1] = c;
          indexData[indexOffset + i + 2] = b;
        } else {
          indexData[indexOffset + i] = a;
          indexData[indexOffset + i + 1] = b;
          indexData[indexOffset + i + 2] = c;
        }
      }
      indexOffset += index.count;
    } else {
      for (let i = 0; i < position.count; i += 3) {
        const a = vertexOffset + i;
        const b = vertexOffset + i + 1;
        const c = vertexOffset + i + 2;
        if (flipWinding) {
          indexData[indexOffset + i] = a;
          indexData[indexOffset + i + 1] = c;
          indexData[indexOffset + i + 2] = b;
        } else {
          indexData[indexOffset + i] = a;
          indexData[indexOffset + i + 1] = b;
          indexData[indexOffset + i + 2] = c;
        }
      }
      indexOffset += position.count;
    }

    vertexOffset += position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    'position',
    new THREE.BufferAttribute(positions.subarray(0, vertexOffset * 3), 3),
  );
  merged.setIndex(new THREE.BufferAttribute(indexData.subarray(0, indexOffset), 1));
  return merged;
}

export interface BakedLevelCollisionData {
  positions: Float32Array;
  indices: Uint32Array;
}

export function serializeLevelCollisionBake(data: BakedLevelCollisionData): ArrayBuffer {
  const headerBytes = 16;
  const buffer = new ArrayBuffer(headerBytes + data.positions.byteLength + data.indices.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x3143484b, true); // KHC1
  view.setUint32(4, 1, true);
  view.setUint32(8, data.positions.length, true);
  view.setUint32(12, data.indices.length, true);
  new Uint8Array(buffer, headerBytes, data.positions.byteLength).set(
    new Uint8Array(data.positions.buffer, data.positions.byteOffset, data.positions.byteLength),
  );
  new Uint8Array(buffer, headerBytes + data.positions.byteLength, data.indices.byteLength).set(
    new Uint8Array(data.indices.buffer, data.indices.byteOffset, data.indices.byteLength),
  );
  return buffer;
}

export function parseLevelCollisionBake(buffer: ArrayBuffer): BakedLevelCollisionData {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x3143484b) {
    throw new Error('Invalid killhouse collision bake magic');
  }
  if (view.getUint32(4, true) !== 1) {
    throw new Error('Unsupported killhouse collision bake version');
  }

  const positionFloatCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  const headerBytes = 16;
  const positions = new Float32Array(buffer, headerBytes, positionFloatCount);
  const indices = new Uint32Array(buffer, headerBytes + positionFloatCount * 4, indexCount);
  return { positions, indices };
}

export function bakedDataFromGeometry(geometry: THREE.BufferGeometry): BakedLevelCollisionData {
  const positionAttr = geometry.attributes.position;
  if (!positionAttr) throw new Error('Collision geometry missing position attribute');
  const positions = new Float32Array(positionAttr.array as Float32Array);
  const indexAttr = geometry.index;
  if (!indexAttr) throw new Error('Collision geometry missing index');
  const indices = new Uint32Array(indexAttr.array as Uint32Array);
  return { positions, indices };
}
