import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakedDataFromGeometry,
  buildMergedLevelCollisionGeometry,
  collectLevelCollisionMeshes,
} from '../../../shared/level/levelMeshCollisionUtils.js';
import { loadKillhouseGroundCollider } from '../../../shared/level/killhouseGroundCollider.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';
import {
  buildKillhouseCollisionScene,
  installThreeNodePolyfills,
} from './buildKillhouseCollisionScene.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

function resolveKillhouseAssetDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../public/3d');
}

async function buildKillhousePhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();
  installThreeNodePolyfills();

  const assetDir = resolveKillhouseAssetDir();
  const root = await buildKillhouseCollisionScene(assetDir);
  const meshes = collectLevelCollisionMeshes([root]);
  const geometry = buildMergedLevelCollisionGeometry(meshes);
  const { positions, indices } = bakedDataFromGeometry(geometry);

  const world = new LevelPhysicsWorld();
  world.init();
  world.loadTrimesh(positions, indices);
  loadKillhouseGroundCollider(world);
  geometry.dispose();

  if (!world.isReady) {
    throw new Error('[ServerPhysics] Failed to build Chrono-Bowl trimesh collision');
  }

  console.info(
    `[ServerPhysics] Built Chrono-Bowl trimesh (${meshes.length} meshes, ${Math.round(indices.length / 3)} tris)`,
  );

  return world;
}

/** Cached killhouse Rapier world — built once from FBX layout, shared across fps rooms. */
export async function getOrBuildKillhousePhysicsWorld(): Promise<LevelPhysicsWorld> {
  if (cachedWorld?.isReady) return cachedWorld;
  if (!loadPromise) {
    loadPromise = buildKillhousePhysicsWorld()
      .then((world) => {
        cachedWorld = world;
        return world;
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}

/** Optional startup warm — avoids first match waiting on FBX load. */
export async function warmKillhousePhysics(): Promise<void> {
  await getOrBuildKillhousePhysicsWorld();
}
