import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARVEST_MAP_COLLISION_BAKE,
  HARVEST_MAP_METADATA_BAKE,
} from '../../../shared/level/harvestMapConfig.js';
import {
  applyHarvestMapServerBake,
  parseHarvestMapBakeMetadata,
} from '../../../shared/level/harvestMapBake.js';
import { parseLevelCollisionBake } from '../../../shared/level/levelMeshCollisionUtils.js';
import { loadHarvestMapGroundCollider } from '../../../shared/level/harvestMapGroundCollider.js';
import {
  buildCraftingStationColliders,
  getCraftingStationSpawns,
} from '../../../shared/level/craftingStationSpawns.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { initRapier } from '../../../shared/physics/rapierInit.js';

let cachedWorld: LevelPhysicsWorld | null = null;
let loadPromise: Promise<LevelPhysicsWorld> | null = null;

function resolveHarvestMapAssetDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../public/3d');
}

async function buildHarvestMapPhysicsWorld(): Promise<LevelPhysicsWorld> {
  await initRapier();

  const world = new LevelPhysicsWorld();
  world.init();

  const assetDir = resolveHarvestMapAssetDir();
  const collisionPath = join(assetDir, HARVEST_MAP_COLLISION_BAKE);
  const metaPath = join(assetDir, HARVEST_MAP_METADATA_BAKE);

  if (!existsSync(collisionPath)) {
    throw new Error(
      `[ServerPhysics] Missing ${HARVEST_MAP_COLLISION_BAKE} ? run \`npm run bake:harvest-map\` and redeploy`,
    );
  }

  const bytes = readFileSync(collisionPath);
  const { positions, indices } = parseLevelCollisionBake(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  world.loadTrimesh(positions, indices);
  loadHarvestMapGroundCollider(world);

  // Solid craft props at map markers (visual FBX is client-only / mode-gated).
  const stationColliders = buildCraftingStationColliders(
    getCraftingStationSpawns('harvest', 'plasma_harvest'),
  );
  if (stationColliders.length > 0) {
    world.loadOrientedBoxes(stationColliders);
  }

  if (existsSync(metaPath)) {
    try {
      const metadata = parseHarvestMapBakeMetadata(readFileSync(metaPath, 'utf8'));
      applyHarvestMapServerBake(metadata);
      console.info(
        `[ServerPhysics] Harvest bake applied (${metadata.spawns.length} spawns)`,
      );
    } catch (error) {
      console.warn(
        '[ServerPhysics] Failed to parse Harvest bake metadata ? using default spawns',
        error,
      );
    }
  } else {
    console.warn(
      `[ServerPhysics] Missing ${HARVEST_MAP_METADATA_BAKE} ? using default Harvest spawns`,
    );
  }

  if (!world.isReady) {
    throw new Error('[ServerPhysics] Failed to build Harvest trimesh collision');
  }

  console.info(
    `[ServerPhysics] Built Harvest trimesh collision (${Math.round(indices.length / 3)} tris)`
      + (stationColliders.length > 0
        ? `, ${stationColliders.length} craft stations`
        : ''),
  );

  return world;
}

export async function getOrBuildHarvestMapPhysicsWorld(): Promise<LevelPhysicsWorld> {
  if (cachedWorld?.isReady) return cachedWorld;
  if (!loadPromise) {
    loadPromise = buildHarvestMapPhysicsWorld()
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

export async function warmHarvestMapPhysics(): Promise<void> {
  await getOrBuildHarvestMapPhysicsWorld();
}
