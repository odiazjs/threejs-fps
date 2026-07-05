import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VOXEL_CELL, VOXEL_COLLIDER_SCALE } from '../shared/level/voxelColliderConfig.mjs';

globalThis.window = {
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
};
globalThis.document = {
  createElementNS: () => ({
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};

const ROOT = process.cwd();
const CELL = VOXEL_CELL;

const BAKES = [
  {
    model: 'bio_wall_basic.fbx',
    scale: 0.02,
    exportPrefix: 'BIO_WALL_BASIC',
    output: 'shared/level/bioWallBasicVoxelColliders.ts',
  },
  {
    model: 'bio_glass_wall.fbx',
    scale: 0.02,
    exportPrefix: 'BIO_GLASS_WALL',
    output: 'shared/level/bioGlassWallVoxelColliders.ts',
  },
  {
    model: 'bio_wall_medium.fbx',
    scale: 0.02,
    exportPrefix: 'BIO_WALL_MEDIUM',
    output: 'shared/level/bioWallMediumVoxelColliders.ts',
  },
];

/** Shield props — voxelized from lod_shield_prop.fbx (low-poly LOD mesh, not a single AABB). */
const LOD_MESH_BAKES = [
  {
    model: 'lod_shield_prop.fbx',
    lodMeshName: 'model_LOD3',
    scale: 0.01,
    exportPrefix: 'LOD_SHIELD_PROP',
    output: 'shared/level/lodShieldPropColliders.ts',
  },
];

function getMeshCentroidXZ(model) {
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  const vertex = new THREE.Vector3();

  model.traverse((child) => {
    if (!child.isMesh || !child.visible || !child.geometry?.attributes?.position) return;
    const positions = child.geometry.attributes.position;
    child.updateWorldMatrix(true, false);
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld);
      sumX += vertex.x;
      sumZ += vertex.z;
      count++;
    }
  });

  if (count === 0) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    return { x: center.x, z: center.z };
  }

  return { x: sumX / count, z: sumZ / count };
}

/** Mirrors prepareWallProp() in KillhouseWall.ts */
function prepareModuleWrapper(fbx, scale, lodMeshName = null) {
  if (lodMeshName) {
    fbx.traverse((child) => {
      if (child.isMesh) {
        child.visible = child.name === lodMeshName;
      }
    });
  }

  fbx.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(fbx);
  const centroid = getMeshCentroidXZ(fbx);
  fbx.position.x -= centroid.x;
  fbx.position.z -= centroid.z;
  fbx.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.add(fbx);
  wrapper.scale.setScalar(scale);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function collectWorldTriangles(root) {
  const triangles = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  root.traverse((child) => {
    if (!child.isMesh || !child.visible) return;
    const geometry = child.geometry;
    const positions = geometry.attributes.position;
    const index = geometry.index;
    child.updateWorldMatrix(true, false);

    const pushTriangle = (a, b, c) => {
      vA.fromBufferAttribute(positions, a).applyMatrix4(child.matrixWorld);
      vB.fromBufferAttribute(positions, b).applyMatrix4(child.matrixWorld);
      vC.fromBufferAttribute(positions, c).applyMatrix4(child.matrixWorld);
      triangles.push(new THREE.Triangle(vA.clone(), vB.clone(), vC.clone()));
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        pushTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
      return;
    }

    for (let i = 0; i < positions.count; i += 3) {
      pushTriangle(i, i + 1, i + 2);
    }
  });

  return triangles;
}

function boundsFromTriangles(triangles) {
  const bounds = new THREE.Box3();
  for (const triangle of triangles) {
    bounds.expandByPoint(triangle.a);
    bounds.expandByPoint(triangle.b);
    bounds.expandByPoint(triangle.c);
  }
  return bounds;
}

const _cellCenter = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _midpoint = new THREE.Vector3();

function cellOccupiesMesh(cellBox, triangles, cellSize) {
  cellBox.getCenter(_cellCenter);
  const maxCenterDist = cellSize * 0.55;

  for (const triangle of triangles) {
    if (!cellBox.intersectsTriangle(triangle)) continue;

    triangle.getMidpoint(_midpoint);
    if (cellBox.containsPoint(_midpoint)) return true;

    triangle.closestPointToPoint(_cellCenter, _closest);
    if (_cellCenter.distanceToSquared(_closest) <= maxCenterDist * maxCenterDist) return true;
  }

  return false;
}

function bakeVoxelColliders(meshBounds, triangles) {
  const colliders = [];
  const cellBox = new THREE.Box3();

  const minX = meshBounds.min.x;
  const minY = meshBounds.min.y;
  const minZ = meshBounds.min.z;
  const maxX = meshBounds.max.x;
  const maxY = meshBounds.max.y;
  const maxZ = meshBounds.max.z;

  for (let x = minX; x <= maxX + 1e-6; x += CELL) {
    for (let y = minY; y <= maxY + 1e-6; y += CELL) {
      for (let z = minZ; z <= maxZ + 1e-6; z += CELL) {
        cellBox.set(new THREE.Vector3(x, y, z), new THREE.Vector3(x + CELL, y + CELL, z + CELL));
        if (!cellOccupiesMesh(cellBox, triangles, CELL)) continue;
        colliders.push({
          minX: +x.toFixed(4),
          minY: +y.toFixed(4),
          minZ: +z.toFixed(4),
          maxX: +(x + CELL).toFixed(4),
          maxY: +(y + CELL).toFixed(4),
          maxZ: +(z + CELL).toFixed(4),
        });
      }
    }
  }

  return colliders;
}

function writeColliderModule({ model, scale, exportPrefix, output }, colliders) {
  const outPath = path.join(ROOT, output);
  const content = `import type { Aabb } from './levelData.js';

/** Voxel colliders for ${model} at scale ${scale}. Cell ${CELL}m; runtime VOXEL_COLLIDER_SCALE=${VOXEL_COLLIDER_SCALE}. Re-run \`npm run bake:voxels\` after model changes. */
export const ${exportPrefix}_VOXEL_COLLIDERS: readonly Aabb[] = ${JSON.stringify(colliders, null, 2)} as const;
`;
  fs.writeFileSync(outPath, content);
}

function writeLodVoxelColliderModule(
  { model, lodMeshName, scale, exportPrefix, output },
  colliders,
) {
  const outPath = path.join(ROOT, output);
  const content = `import type { Aabb } from './levelData.js';

/** Voxel colliders from ${model} (${lodMeshName}) at scale ${scale}. Cell ${CELL}m; runtime VOXEL_COLLIDER_SCALE=${VOXEL_COLLIDER_SCALE}. Re-run \`npm run bake:voxels\` after model changes. */
export const ${exportPrefix}_COLLIDERS: readonly Aabb[] = ${JSON.stringify(colliders, null, 2)} as const;
`;
  fs.writeFileSync(outPath, content);
}

const loader = new FBXLoader();

for (const bake of BAKES) {
  const buffer = fs.readFileSync(path.join(ROOT, '3d', bake.model));
  const fbx = loader.parse(buffer.buffer, bake.model);
  const wrapper = prepareModuleWrapper(fbx, bake.scale);
  const triangles = collectWorldTriangles(wrapper);
  const meshBounds = boundsFromTriangles(triangles);
  const colliders = bakeVoxelColliders(meshBounds, triangles);
  writeColliderModule(bake, colliders);
  console.log(
    `[bake-voxel-colliders] ${bake.model} scale=${bake.scale} → ${colliders.length} voxels → ${bake.output}`,
  );
}

for (const bake of LOD_MESH_BAKES) {
  const buffer = fs.readFileSync(path.join(ROOT, '3d', bake.model));
  const fbx = loader.parse(buffer.buffer, bake.model);
  const wrapper = prepareModuleWrapper(fbx, bake.scale, bake.lodMeshName);
  const triangles = collectWorldTriangles(wrapper);
  const meshBounds = boundsFromTriangles(triangles);
  const colliders = bakeVoxelColliders(meshBounds, triangles);
  writeLodVoxelColliderModule(bake, colliders);
  console.log(
    `[bake-voxel-colliders] ${bake.model} ${bake.lodMeshName} scale=${bake.scale} → ${colliders.length} voxels → ${bake.output}`,
  );
}
