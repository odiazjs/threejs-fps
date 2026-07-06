import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakedDataFromGeometry,
  buildMergedLevelCollisionGeometry,
  collectLevelCollisionMeshes,
} from '../../../shared/level/levelMeshCollisionUtils.js';
import { loadFiringRangeGroundCollider } from '../../../shared/level/firingRangeGroundCollider.js';
import { loadFiringRangeCrateColliders } from '../../../shared/level/loadFiringRangeCrateColliders.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';
import {
  buildFiringRangeCollisionScene,
  installThreeNodePolyfills,
} from './buildFiringRangeCollision.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

function resolveFiringRangeAssetDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../public/3d');
}

async function buildFiringRangePhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();
  installThreeNodePolyfills();

  const world = new LevelPhysicsWorld();
  world.init();

  try {
    const assetDir = resolveFiringRangeAssetDir();
    const root = await buildFiringRangeCollisionScene(assetDir);
    const meshes = collectLevelCollisionMeshes([root]);
    if (meshes.length === 0) {
      throw new Error('[ServerPhysics] No collision meshes in firing_range_map.glb');
    }

    const geometry = buildMergedLevelCollisionGeometry(meshes);
    const { positions, indices } = bakedDataFromGeometry(geometry);
    if (positions.length < 9 || indices.length < 3) {
      throw new Error('[ServerPhysics] firing_range_map.glb collision geometry is empty');
    }

    world.loadTrimesh(positions, indices);
    geometry.dispose();

    console.info(
      `[ServerPhysics] Built Firing Range trimesh (${meshes.length} meshes, ${Math.round(indices.length / 3)} tris)`,
    );
  } catch (error) {
    console.warn(
      '[ServerPhysics] firing_range_map.glb not ready — Firing Range uses ground-only collision until the GLB is deployed',
      error,
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
