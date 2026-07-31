import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import type { Aabb } from '../shared/level/levelData.js';
import {
  SHOWCASE_MAP_BAKE_VERSION,
  type ShowcaseMapBakeMetadata,
} from '../shared/level/showcaseMapBake.js';
import {
  SHOWCASE_MAP_COLLISION_BAKE,
  SHOWCASE_MAP_METADATA_BAKE,
} from '../shared/level/showcaseMapConfig.js';
import {
  extractShowcaseMapSpawnPoint,
  extractShowcaseMapStructuralBoxes,
} from '../shared/level/showcaseMapMeshPrep.js';
import {
  buildMergedLevelCollisionGeometry,
  collectLevelCollisionMeshes,
  serializeLevelCollisionBake,
} from '../shared/level/levelMeshCollisionUtils.js';
import { installThreeNodePolyfills } from '../server/src/level/buildFiringRangeCollision.js';
import { buildShowcaseMapCollisionScene } from '../server/src/level/buildShowcaseMapCollision.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(repoRoot, '3d');
const publicDir = join(repoRoot, 'public/3d');

/**
 * Vertex-clustering cell size (meters). Keeps a playable silhouette for
 * GitHub-friendly collision binaries.
 */
const CLUSTER_CELL = Number(process.env.SHOWCASE_BAKE_CELL ?? '0.25');

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

interface DecimatedMesh {
  positions: Float32Array;
  indices: Uint32Array;
  skippedNanTris: number;
}

function decimateByClustering(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  cell: number,
): DecimatedMesh {
  const clusterIndexByKey = new Map<string, number>();
  const sums: number[] = [];
  const counts: number[] = [];
  const clusterOfVertex = new Int32Array(positions.length / 3).fill(-1);
  let skippedNanTris = 0;

  const clusterForVertex = (vertexIndex: number): number => {
    const cached = clusterOfVertex[vertexIndex]!;
    if (cached >= 0) return cached;

    const x = positions[vertexIndex * 3] as number;
    const y = positions[vertexIndex * 3 + 1] as number;
    const z = positions[vertexIndex * 3 + 2] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return -1;
    }

    const key = `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
    let cluster = clusterIndexByKey.get(key);
    if (cluster === undefined) {
      cluster = counts.length;
      clusterIndexByKey.set(key, cluster);
      sums.push(0, 0, 0);
      counts.push(0);
    }
    sums[cluster * 3] += x;
    sums[cluster * 3 + 1] += y;
    sums[cluster * 3 + 2] += z;
    counts[cluster] += 1;
    clusterOfVertex[vertexIndex] = cluster;
    return cluster;
  };

  const outIndices: number[] = [];
  const triKeys = new Set<string>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = clusterForVertex(indices[i] as number);
    const b = clusterForVertex(indices[i + 1] as number);
    const c = clusterForVertex(indices[i + 2] as number);
    if (a < 0 || b < 0 || c < 0) {
      skippedNanTris++;
      continue;
    }
    if (a === b || b === c || a === c) continue;

    const key = [a, b, c].sort((p, q) => p - q).join(',');
    if (triKeys.has(key)) continue;
    triKeys.add(key);

    outIndices.push(a, b, c);
  }

  const outPositions = new Float32Array(counts.length * 3);
  for (let cluster = 0; cluster < counts.length; cluster++) {
    const n = counts[cluster]!;
    outPositions[cluster * 3] = sums[cluster * 3]! / n;
    outPositions[cluster * 3 + 1] = sums[cluster * 3 + 1]! / n;
    outPositions[cluster * 3 + 2] = sums[cluster * 3 + 2]! / n;
  }

  return {
    positions: outPositions,
    indices: Uint32Array.from(outIndices),
    skippedNanTris,
  };
}

function meshWorldAabb(mesh: THREE.Mesh): Aabb | null {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.attributes.position;
  if (!position) return null;

  const v = new THREE.Vector3();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) continue;
    v.applyMatrix4(mesh.matrixWorld);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }

  if (!Number.isFinite(minX)) return null;
  return {
    minX: round(minX, 3),
    minY: round(minY, 3),
    minZ: round(minZ, 3),
    maxX: round(maxX, 3),
    maxY: round(maxY, 3),
    maxZ: round(maxZ, 3),
  };
}

async function main(): Promise<void> {
  installThreeNodePolyfills();

  // Always bake from repo `3d/` (source of truth). `sync:3d` may lag behind.
  const root = await buildShowcaseMapCollisionScene(sourceDir);

  const meshes = collectLevelCollisionMeshes([root]);
  if (meshes.length === 0) {
    throw new Error('[bake:showcase-map] No collision meshes found in showcase_map.glb');
  }

  const merged = buildMergedLevelCollisionGeometry(meshes);
  const sourceTris = Math.round((merged.index?.count ?? 0) / 3);
  const { positions, indices, skippedNanTris } = decimateByClustering(
    merged.attributes.position.array,
    merged.index!.array,
    CLUSTER_CELL,
  );

  const spawnRaw = extractShowcaseMapSpawnPoint(root);
  if (!spawnRaw) {
    throw new Error(
      '[bake:showcase-map] No player_spawn1 marker found in showcase_map.glb',
    );
  }
  const spawn = { x: round(spawnRaw.x, 2), z: round(spawnRaw.z, 2) };

  const structuralBoxes: Aabb[] = [];
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  for (const mesh of meshes) {
    const box = meshWorldAabb(mesh);
    if (!box) continue;
    structuralBoxes.push(box);
    bounds.minX = Math.min(bounds.minX, box.minX);
    bounds.minY = Math.min(bounds.minY, box.minY);
    bounds.minZ = Math.min(bounds.minZ, box.minZ);
    bounds.maxX = Math.max(bounds.maxX, box.maxX);
    bounds.maxY = Math.max(bounds.maxY, box.maxY);
    bounds.maxZ = Math.max(bounds.maxZ, box.maxZ);
  }

  // Also keep the lighter helper for minimap parity with other maps.
  void extractShowcaseMapStructuralBoxes;

  const metadata: ShowcaseMapBakeMetadata = {
    version: SHOWCASE_MAP_BAKE_VERSION,
    spawn,
    structuralBoxes,
  };

  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const json = `${JSON.stringify(metadata, null, 2)}\n`;
  const collisionBuffer = Buffer.from(
    serializeLevelCollisionBake({ positions, indices }),
  );

  for (const dir of [sourceDir, publicDir]) {
    writeFileSync(join(dir, SHOWCASE_MAP_METADATA_BAKE), json);
    writeFileSync(join(dir, SHOWCASE_MAP_COLLISION_BAKE), collisionBuffer);
  }

  const metaKb = Math.round(
    readFileSync(join(sourceDir, SHOWCASE_MAP_METADATA_BAKE)).byteLength / 1024,
  );
  const binMb = (collisionBuffer.byteLength / (1024 * 1024)).toFixed(1);
  console.info(
    `[bake:showcase-map] Wrote ${SHOWCASE_MAP_METADATA_BAKE} (${metaKb} KB, `
      + `spawn ${spawn.x},${spawn.z}, ${structuralBoxes.length} structural boxes) `
      + `and ${SHOWCASE_MAP_COLLISION_BAKE} (${binMb} MB)`,
  );
  console.info(
    `[bake:showcase-map] Collision: ${meshes.length} meshes, ${sourceTris} -> `
      + `${Math.round(indices.length / 3)} tris (cell ${CLUSTER_CELL}m, ${skippedNanTris} NaN tris skipped)`,
  );
  console.info(
    `[bake:showcase-map] Bounds: `
      + `x [${bounds.minX.toFixed(2)}, ${bounds.maxX.toFixed(2)}], `
      + `y [${bounds.minY.toFixed(2)}, ${bounds.maxY.toFixed(2)}], `
      + `z [${bounds.minZ.toFixed(2)}, ${bounds.maxZ.toFixed(2)}]`,
  );
  console.info(
    `[bake:showcase-map] Suggested WIDTH/DEPTH: `
      + `${(bounds.maxX - bounds.minX).toFixed(1)} / ${(bounds.maxZ - bounds.minZ).toFixed(1)}`,
  );
}

main().catch((error) => {
  console.error('[bake:showcase-map] Failed:', error);
  process.exit(1);
});
