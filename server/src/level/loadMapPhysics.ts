import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMapDef, type MapCollisionDef } from '../../../shared/level/maps.js';
import { parseLevelCollisionBake } from '../../../shared/level/levelMeshCollisionUtils.js';
import { loadKillhouseGroundCollider } from '../../../shared/level/killhouseGroundCollider.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { setMapPhysics } from '../../../shared/level/mapMeshMovement.js';

const bakedPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../shared/level/baked/killhouse_small.collision.bin',
);

export function loadMapPhysicsForServer(map: MapCollisionDef): void {
  const world = new LevelPhysicsWorld();
  world.init();

  if (map.id === 'killhouse_small') {
    let file: Buffer;
    try {
      file = readFileSync(bakedPath);
    } catch {
      throw new Error(
        '[ServerPhysics] Missing killhouse_small.collision.bin — run `npm run bake:collision` from the repo root',
      );
    }
    const { positions, indices } = parseLevelCollisionBake(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    );
    world.loadTrimesh(positions, indices);
    loadKillhouseGroundCollider(world);
    console.info('[ServerPhysics] Loaded Chrono-Bowl trimesh collision');
  } else {
    world.loadAABBs(map.getLevelColliders());
    console.info(
      `[ServerPhysics] Loaded ${map.id} AABB collision (${map.getLevelColliders().length} boxes)`,
    );
  }

  if (!world.isReady) {
    throw new Error(`[ServerPhysics] Failed to initialize physics for ${map.id}`);
  }

  setMapPhysics(world);
}

/** @deprecated Use loadMapPhysicsForServer */
export function loadKillhouseMeshCollisionForServer(): void {
  loadMapPhysicsForServer(getMapDef('killhouse_small'));
}
