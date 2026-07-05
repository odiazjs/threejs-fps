import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakedDataFromGeometry,
  buildMergedLevelCollisionGeometry,
  collectLevelCollisionMeshes,
  serializeLevelCollisionBake,
} from '../shared/level/levelMeshCollisionUtils.ts';
import {
  buildKillhouseCollisionScene,
  installThreeNodePolyfills,
} from './lib/killhouseCollisionBakeScene.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const assetDir = join(repoRoot, 'public/3d');
const outputPath = join(repoRoot, 'shared/level/baked/killhouse_small.collision.bin');

installThreeNodePolyfills();

const root = await buildKillhouseCollisionScene(assetDir);
const meshes = collectLevelCollisionMeshes([root]);
const geometry = buildMergedLevelCollisionGeometry(meshes);
const bake = bakedDataFromGeometry(geometry);
const buffer = serializeLevelCollisionBake(bake);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(buffer));

const triangleCount = bake.indices.length / 3;
console.info(
  `[bake:collision] Wrote ${outputPath} (${meshes.length} meshes, ${Math.round(triangleCount)} tris, ${(buffer.byteLength / 1024).toFixed(1)} KB)`,
);

geometry.dispose();
