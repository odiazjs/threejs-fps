import { getMapDef, type MapCollisionDef } from '../../../shared/level/maps.js';
import { LevelPhysicsWorld } from '../../../shared/physics/levelPhysicsWorld.js';
import { setMapPhysics } from '../../../shared/level/mapMeshMovement.js';
import { getOrBuildKillhousePhysicsWorld } from './killhousePhysicsCache.js';

export async function loadMapPhysicsForServer(map: MapCollisionDef): Promise<void> {
  if (map.id === 'killhouse_small') {
    const world = await getOrBuildKillhousePhysicsWorld();
    setMapPhysics(world);
    return;
  }

  const world = new LevelPhysicsWorld();
  world.init();
  world.loadAABBs(map.getLevelColliders());
  console.info(
    `[ServerPhysics] Loaded ${map.id} AABB collision (${map.getLevelColliders().length} boxes)`,
  );

  if (!world.isReady) {
    throw new Error(`[ServerPhysics] Failed to initialize physics for ${map.id}`);
  }

  setMapPhysics(world);
}

/** @deprecated Use loadMapPhysicsForServer */
export async function loadKillhouseMeshCollisionForServer(): Promise<void> {
  await loadMapPhysicsForServer(getMapDef('killhouse_small'));
}
