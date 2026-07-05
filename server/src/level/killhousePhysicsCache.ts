import { buildKillhouseServerColliders } from '../../../shared/level/killhouseServerColliders.js';
import { loadKillhouseGroundCollider } from '../../../shared/level/killhouseGroundCollider.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

async function buildKillhousePhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();

  const boxes = buildKillhouseServerColliders();
  if (boxes.length === 0) {
    throw new Error('[ServerPhysics] No box colliders for Chrono-Bowl layout');
  }

  const world = new LevelPhysicsWorld();
  world.init();
  world.loadOrientedBoxes(boxes);
  loadKillhouseGroundCollider(world);

  if (!world.isReady) {
    throw new Error('[ServerPhysics] Failed to build Chrono-Bowl box collision');
  }

  console.info(`[ServerPhysics] Built Chrono-Bowl box collision (${boxes.length} colliders)`);

  return world;
}

/** Cached killhouse Rapier world — box colliders from layout data, shared across fps rooms. */
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

/** Optional startup warm — instant with box colliders (no FBX load). */
export async function warmKillhousePhysics(): Promise<void> {
  await getOrBuildKillhousePhysicsWorld();
}
