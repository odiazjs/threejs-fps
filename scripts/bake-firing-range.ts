import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIRING_RANGE_METADATA_BAKE,
  type FiringRangeBakeMetadata,
} from '../shared/level/firingRangeBake.js';
import {
  extractFiringRangeCrateColliders,
  extractFiringRangeCrateTops,
  extractFiringRangeSpawnPoint,
  extractFiringRangeStructuralBoxes,
} from '../shared/level/firingRangeMeshPrep.js';
import {
  buildFiringRangeCollisionScene,
  installThreeNodePolyfills,
} from '../server/src/level/buildFiringRangeCollision.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(repoRoot, '3d');
const publicDir = join(repoRoot, 'public/3d');

async function main(): Promise<void> {
  installThreeNodePolyfills();

  const root = await buildFiringRangeCollisionScene(publicDir);
  const structuralBoxes = extractFiringRangeStructuralBoxes(root);

  const metadata: FiringRangeBakeMetadata = {
    version: 1,
    spawn: extractFiringRangeSpawnPoint(root),
    crateColliders: extractFiringRangeCrateColliders(root),
    crateTops: extractFiringRangeCrateTops(root),
    structuralBoxes,
  };

  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const json = `${JSON.stringify(metadata, null, 2)}\n`;
  const sourcePath = join(sourceDir, FIRING_RANGE_METADATA_BAKE);
  const publicPath = join(publicDir, FIRING_RANGE_METADATA_BAKE);
  writeFileSync(sourcePath, json);
  writeFileSync(publicPath, json);

  const metaKb = Math.round(readFileSync(sourcePath).byteLength / 1024);

  console.info(
    `[bake:firing-range] Wrote ${FIRING_RANGE_METADATA_BAKE} (${metaKb} KB, `
    + `${metadata.structuralBoxes.length} structural boxes, `
    + `${metadata.crateColliders.length} crate colliders, ${metadata.crateTops.length} crate tops)`,
  );
}

main().catch((error) => {
  console.error('[bake:firing-range] Failed:', error);
  process.exit(1);
});
