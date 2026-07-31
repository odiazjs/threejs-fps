import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHOWCASE_MAP_COLLISION_BAKE,
  SHOWCASE_MAP_METADATA_BAKE,
} from '../../../shared/level/showcaseMapConfig.js';
import {
  applyShowcaseMapServerBake,
  parseShowcaseMapBakeMetadata,
} from '../../../shared/level/showcaseMapBake.js';
import { parseLevelCollisionBake } from '../../../shared/level/levelMeshCollisionUtils.js';
import { loadShowcaseMapGroundCollider } from '../../../shared/level/showcaseMapGroundCollider.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

function resolveShowcaseMapAssetDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../public/3d');
}

async function buildShowcaseMapPhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();

  const world = new LevelPhysicsWorld();
  world.init();

  const assetDir = resolveShowcaseMapAssetDir();
  const collisionPath = join(assetDir, SHOWCASE_MAP_COLLISION_BAKE);
  const metaPath = join(assetDir, SHOWCASE_MAP_METADATA_BAKE);

  if (!existsSync(collisionPath)) {
    throw new Error(
      `[ServerPhysics] Missing ${SHOWCASE_MAP_COLLISION_BAKE} � run \`npm run bake:showcase-map\` and redeploy`,
    );
  }

  const bytes = readFileSync(collisionPath);
  const { positions, indices } = parseLevelCollisionBake(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  world.loadTrimesh(positions, indices);
  loadShowcaseMapGroundCollider(world);

  if (existsSync(metaPath)) {
    try {
      const metadata = parseShowcaseMapBakeMetadata(readFileSync(metaPath, 'utf8'));
      applyShowcaseMapServerBake(metadata);
      console.info(
        `[ServerPhysics] Showcase bake applied (spawn ${metadata.spawn?.x.toFixed(2)}, ${metadata.spawn?.z.toFixed(2)})`,
      );
    } catch (error) {
      console.warn(
        '[ServerPhysics] Failed to parse Showcase bake metadata � using default spawn',
        error,
      );
    }
  } else {
    console.warn(
      `[ServerPhysics] Missing ${SHOWCASE_MAP_METADATA_BAKE} � using default Showcase spawn`,
    );
  }

  if (!world.isReady) {
    throw new Error('[ServerPhysics] Failed to build Showcase trimesh collision');
  }

  console.info(
    `[ServerPhysics] Built Showcase trimesh collision (${Math.round(indices.length / 3)} tris)`,
  );

  return world;
}

/** Cached Showcase (showcase_map.glb) Rapier world � shared across fps rooms. */
export async function getOrBuildShowcaseMapPhysicsWorld(): Promise<LevelPhysicsWorld> {
  if (cachedWorld?.isReady) return cachedWorld;
  if (!loadPromise) {
    loadPromise = buildShowcaseMapPhysicsWorld()
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

export async function warmShowcaseMapPhysics(): Promise<void> {
  await getOrBuildShowcaseMapPhysicsWorld();
}
