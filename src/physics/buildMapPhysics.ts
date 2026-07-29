import * as THREE from 'three';
import type { MapCollisionDef } from '../../shared/level/maps';
import { getClientGameplayColliders } from '../../shared/level/maps';
import {
  buildMergedLevelCollisionGeometry,
  collectLevelCollisionMeshes,
  parseLevelCollisionBake,
  type BakedLevelCollisionData,
} from '../../shared/level/levelMeshCollisionUtils';
import { TDM_MAP_COLLISION_BAKE } from '../../shared/level/tdmMapConfig';
import { HARVEST_MAP_COLLISION_BAKE } from '../../shared/level/harvestMapConfig';
import { LevelPhysicsWorld } from '../../shared/physics/levelPhysicsWorld';
import { initRapier } from '../../shared/physics/rapierInit';
import { setMapPhysics } from '../../shared/level/mapMeshMovement';
import { loadTdmMapGroundCollider } from '../../shared/level/tdmMapGroundCollider';
import { loadHarvestMapGroundCollider } from '../../shared/level/harvestMapGroundCollider';
import {
  buildCraftingStationColliders,
  getCraftingStationSpawns,
} from '../../shared/level/craftingStationSpawns';
import { loadFiringRangeGroundCollider } from '../../shared/level/firingRangeGroundCollider';
import { loadFiringRangeCrateColliders } from '../../shared/level/loadFiringRangeCrateColliders';
import {
  createAabbColliderDebugGroup,
  createTrimeshColliderDebugMesh,
  disposePhysicsColliderDebugMesh,
  isPhysicsColliderDebugEnabled,
} from '../debug/PhysicsColliderDebugMesh';

let clientPhysics: LevelPhysicsWorld | null = null;
let clientPhysicsDebugMesh: THREE.Object3D | null = null;

export function getClientPhysicsWorld(): LevelPhysicsWorld | null {
  return clientPhysics;
}

function clearPhysicsColliderDebug(): void {
  if (!clientPhysicsDebugMesh) return;
  clientPhysicsDebugMesh.parent?.remove(clientPhysicsDebugMesh);
  disposePhysicsColliderDebugMesh(clientPhysicsDebugMesh);
  clientPhysicsDebugMesh = null;
}

function attachPhysicsColliderDebug(scene: THREE.Scene, object: THREE.Object3D): void {
  clearPhysicsColliderDebug();
  clientPhysicsDebugMesh = object;
  scene.add(object);
}

/**
 * Chrono-Bowl's source GLB is sculpt-dense (~4.2M tris) — merging it at runtime
 * would stall the browser. Load the decimated bake the server also uses so both
 * sides collide against identical geometry.
 */
async function fetchTdmMapCollisionBake(): Promise<BakedLevelCollisionData> {
  const response = await fetch(`/3d/${TDM_MAP_COLLISION_BAKE}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${TDM_MAP_COLLISION_BAKE} (${response.status})`);
  }
  return parseLevelCollisionBake(await response.arrayBuffer());
}

async function fetchHarvestMapCollisionBake(): Promise<BakedLevelCollisionData> {
  const response = await fetch(`/3d/${HARVEST_MAP_COLLISION_BAKE}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${HARVEST_MAP_COLLISION_BAKE} (${response.status})`,
    );
  }
  return parseLevelCollisionBake(await response.arrayBuffer());
}

export async function buildClientMapPhysics(
  map: MapCollisionDef,
  collisionRoots?: readonly THREE.Object3D[],
  scene?: THREE.Scene,
): Promise<LevelPhysicsWorld> {
  await initRapier();

  clientPhysics?.dispose();
  clientPhysics = new LevelPhysicsWorld();
  clientPhysics.init();
  clearPhysicsColliderDebug();

  if (map.usesMeshCollision && map.id === 'killhouse_small') {
    const { positions, indices } = await fetchTdmMapCollisionBake();
    clientPhysics.loadTrimesh(positions, indices);
    loadTdmMapGroundCollider(clientPhysics);

    console.info(
      `[ClientPhysics] Loaded ${map.label} baked trimesh (${Math.round(indices.length / 3)} tris)`,
    );

    if (isPhysicsColliderDebugEnabled() && scene) {
      const debugGeometry = new THREE.BufferGeometry();
      debugGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      debugGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
      attachPhysicsColliderDebug(scene, createTrimeshColliderDebugMesh(debugGeometry));
    }
  } else if (map.usesMeshCollision && map.id === 'harvest') {
    const { positions, indices } = await fetchHarvestMapCollisionBake();
    clientPhysics.loadTrimesh(positions, indices);
    loadHarvestMapGroundCollider(clientPhysics);
    const stationColliders = buildCraftingStationColliders(
      getCraftingStationSpawns('harvest', 'plasma_harvest'),
    );
    if (stationColliders.length > 0) {
      clientPhysics.loadOrientedBoxes(stationColliders);
    }

    console.info(
      `[ClientPhysics] Loaded ${map.label} baked trimesh (${Math.round(indices.length / 3)} tris)`
        + (stationColliders.length > 0
          ? `, ${stationColliders.length} craft stations`
          : ''),
    );

    if (isPhysicsColliderDebugEnabled() && scene) {
      const debugGeometry = new THREE.BufferGeometry();
      debugGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      debugGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
      attachPhysicsColliderDebug(scene, createTrimeshColliderDebugMesh(debugGeometry));
    }
  } else if (map.usesMeshCollision && collisionRoots?.length) {
    const meshes = collectLevelCollisionMeshes(collisionRoots);
    const geometry = buildMergedLevelCollisionGeometry(meshes);
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index!.array as Uint32Array;
    clientPhysics.loadTrimesh(positions, indices);

    if (map.id === 'killhouse_small') {
      loadTdmMapGroundCollider(clientPhysics);
    } else if (map.id === 'harvest') {
      loadHarvestMapGroundCollider(clientPhysics);
    } else if (map.id === 'firing_range') {
      loadFiringRangeGroundCollider(clientPhysics);
      const crateCount = loadFiringRangeCrateColliders(clientPhysics);
      if (crateCount > 0) {
        console.info(`[ClientPhysics] Firing Range crate cuboids (${crateCount})`);
      }
    }

    console.info(
      `[ClientPhysics] Built ${map.label} trimesh (${meshes.length} meshes, ${Math.round(indices.length / 3)} tris)`,
    );

    if (isPhysicsColliderDebugEnabled() && scene) {
      attachPhysicsColliderDebug(scene, createTrimeshColliderDebugMesh(geometry));
    } else {
      geometry.dispose();
    }
  } else if (map.usesMeshCollision && map.id === 'firing_range') {
    loadFiringRangeGroundCollider(clientPhysics);
    console.info('[ClientPhysics] Firing Range ground-only collision (awaiting firing_range_map.glb)');
  } else {
    const boxes = getClientGameplayColliders(map);
    clientPhysics.loadAABBs(boxes);
    console.info(`[ClientPhysics] Built ${map.id} AABB collision (${boxes.length} boxes)`);

    if (isPhysicsColliderDebugEnabled() && scene) {
      attachPhysicsColliderDebug(scene, createAabbColliderDebugGroup(boxes));
    }
  }

  setMapPhysics(clientPhysics);
  return clientPhysics;
}

export function disposeClientMapPhysics(): void {
  clearPhysicsColliderDebug();
  clientPhysics?.dispose();
  clientPhysics = null;
  setMapPhysics(null);
}
