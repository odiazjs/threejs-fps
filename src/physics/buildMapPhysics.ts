import type * as THREE from 'three';
import type { MapCollisionDef } from '../../shared/level/maps';
import { getClientGameplayColliders } from '../../shared/level/maps';
import {
  buildMergedLevelCollisionGeometry,
  collectLevelCollisionMeshes,
} from '../../shared/level/levelMeshCollisionUtils';
import { LevelPhysicsWorld } from '../../shared/physics/levelPhysicsWorld';
import { initRapier } from '../../shared/physics/rapierInit';
import { setMapPhysics } from '../../shared/level/mapMeshMovement';
import { loadKillhouseGroundCollider } from '../../shared/level/killhouseGroundCollider';
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

  if (map.id === 'killhouse_small' && collisionRoots?.length) {
    const meshes = collectLevelCollisionMeshes(collisionRoots);
    const geometry = buildMergedLevelCollisionGeometry(meshes);
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index!.array as Uint32Array;
    clientPhysics.loadTrimesh(positions, indices);
    loadKillhouseGroundCollider(clientPhysics);
    console.info(
      `[ClientPhysics] Built Chrono-Bowl trimesh (${meshes.length} meshes, ${Math.round(indices.length / 3)} tris)`,
    );

    if (isPhysicsColliderDebugEnabled() && scene) {
      attachPhysicsColliderDebug(scene, createTrimeshColliderDebugMesh(geometry));
    } else {
      geometry.dispose();
    }
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
