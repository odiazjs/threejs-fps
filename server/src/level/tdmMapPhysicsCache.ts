import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TDM_MAP_COLLISION_BAKE,
  TDM_MAP_METADATA_BAKE,
} from '../../../shared/level/tdmMapConfig.js';
import {
  applyTdmMapServerBake,
  parseTdmMapBakeMetadata,
} from '../../../shared/level/tdmMapBake.js';
import { parseLevelCollisionBake } from '../../../shared/level/levelMeshCollisionUtils.js';
import { loadTdmMapGroundCollider } from '../../../shared/level/tdmMapGroundCollider.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

function resolveTdmMapAssetDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../public/3d');
}

async function buildTdmMapPhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();

  const world = new LevelPhysicsWorld();
  world.init();

  const assetDir = resolveTdmMapAssetDir();
  const collisionPath = join(assetDir, TDM_MAP_COLLISION_BAKE);
  const metaPath = join(assetDir, TDM_MAP_METADATA_BAKE);

  if (!existsSync(collisionPath)) {
    throw new Error(
      `[ServerPhysics] Missing ${TDM_MAP_COLLISION_BAKE} — run \`npm run bake:tdm-map\` and redeploy`,
    );
  }

  const bytes = readFileSync(collisionPath);
  const { positions, indices } = parseLevelCollisionBake(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  world.loadTrimesh(positions, indices);
  loadTdmMapGroundCollider(world);

  if (existsSync(metaPath)) {
    try {
      const metadata = parseTdmMapBakeMetadata(readFileSync(metaPath, 'utf8'));
      applyTdmMapServerBake(metadata);
      console.info(
        `[ServerPhysics] Chrono-Bowl bake applied (${metadata.spawns.length} spawns)`,
      );
    } catch (error) {
      console.warn(
        '[ServerPhysics] Failed to parse Chrono-Bowl bake metadata — using default spawns',
        error,
      );
    }
  } else {
    console.warn(
      `[ServerPhysics] Missing ${TDM_MAP_METADATA_BAKE} — using default Chrono-Bowl spawns`,
    );
  }

  if (!world.isReady) {
    throw new Error('[ServerPhysics] Failed to build Chrono-Bowl trimesh collision');
  }

  console.info(
    `[ServerPhysics] Built Chrono-Bowl trimesh collision (${Math.round(indices.length / 3)} tris)`,
  );

  return world;
}

/** Cached Chrono-Bowl (tdm_map.glb) Rapier world — shared across fps rooms. */
export async function getOrBuildTdmMapPhysicsWorld(): Promise<LevelPhysicsWorld> {
  if (cachedWorld?.isReady) return cachedWorld;
  if (!loadPromise) {
    loadPromise = buildTdmMapPhysicsWorld()
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

export async function warmTdmMapPhysics(): Promise<void> {
  await getOrBuildTdmMapPhysicsWorld();
}
