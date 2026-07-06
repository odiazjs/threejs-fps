import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIRING_RANGE_METADATA_BAKE,
  applyFiringRangeServerBake,
  parseFiringRangeBakeMetadata,
} from '../../../shared/level/firingRangeBake.js';
import { loadFiringRangeGroundCollider } from '../../../shared/level/firingRangeGroundCollider.js';
import { loadFiringRangeCrateColliders } from '../../../shared/level/loadFiringRangeCrateColliders.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

function resolveFiringRangeAssetDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../public/3d');
}

async function buildFiringRangePhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();

  const world = new LevelPhysicsWorld();
  world.init();

  const assetDir = resolveFiringRangeAssetDir();
  const metaPath = join(assetDir, FIRING_RANGE_METADATA_BAKE);

  if (existsSync(metaPath)) {
    try {
      const metadata = parseFiringRangeBakeMetadata(readFileSync(metaPath, 'utf8'));
      applyFiringRangeServerBake(metadata);
      world.loadAABBs(metadata.structuralBoxes);

      console.info(
        `[ServerPhysics] Loaded Firing Range baked collision (${metadata.structuralBoxes.length} structural boxes, `
        + `${metadata.crateColliders.length} crate cuboids, ${metadata.crateTops.length} crate tops)`,
      );
    } catch (error) {
      console.warn(
        '[ServerPhysics] Failed to load Firing Range baked collision — using ground-only collision',
        error,
      );
    }
  } else {
    console.warn(
      `[ServerPhysics] Missing ${FIRING_RANGE_METADATA_BAKE} — `
      + 'run `npm run bake:firing-range` and redeploy. Using ground-only collision.',
    );
  }

  loadFiringRangeGroundCollider(world);
  const crateCount = loadFiringRangeCrateColliders(world);
  if (crateCount > 0) {
    console.info(`[ServerPhysics] Firing Range crate cuboids (${crateCount})`);
  }

  if (!world.isReady) {
    throw new Error('[ServerPhysics] Failed to build Firing Range collision');
  }

  return world;
}

export async function getOrBuildFiringRangePhysicsWorld(): Promise<LevelPhysicsWorld> {
  if (cachedWorld?.isReady) return cachedWorld;
  if (!loadPromise) {
    loadPromise = buildFiringRangePhysicsWorld()
      .then((world) => {
        cachedWorld = world;
        return world;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export async function warmFiringRangePhysics(): Promise<void> {
  await getOrBuildFiringRangePhysicsWorld();
}
