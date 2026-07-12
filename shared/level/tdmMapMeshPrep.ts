import * as THREE from 'three';
import { isThreeMesh } from './collisionMeshPrep.js';
import {
  TDM_MAP_SCALE,
  isTdmMapBackgroundName,
  isTdmMapSpawnName,
} from './tdmMapConfig.js';
import { setTdmMapSpawnPoints, type TdmSpawnPoint } from './tdmMapColliders.js';

const _spawnWorldPos = new THREE.Vector3();

function isUnderBackgroundNode(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (isTdmMapBackgroundName(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Mark gameplay collision meshes in tdm_map.glb.
 * `bg_rock_*` meshes are environmental dressing only — never collidable.
 */
export function markTdmMapCollisionMeshes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isThreeMesh(child)) return;
    if (isUnderBackgroundNode(child)) {
      child.userData.skipCollision = true;
      return;
    }
    child.userData.collisionMesh = true;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

/** World XZ of every `spawn_*` empty in the map. */
export function extractTdmMapSpawnPoints(root: THREE.Object3D): TdmSpawnPoint[] {
  const points: TdmSpawnPoint[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!isTdmMapSpawnName(child.name)) return;
    child.getWorldPosition(_spawnWorldPos);
    points.push({ x: _spawnWorldPos.x, z: _spawnWorldPos.z });
  });
  return points;
}

/**
 * Collision-mark a loaded tdm_map.glb root and register its spawn markers.
 * The GLB is authored centered at the origin with the floor at Y=0, so no
 * re-alignment is applied — client, server bake, and spawns stay in sync.
 */
export function prepareTdmMapRoot(
  mapRoot: THREE.Object3D,
  scale = TDM_MAP_SCALE,
): void {
  if (scale !== 1) {
    mapRoot.scale.setScalar(scale);
  }
  mapRoot.updateMatrixWorld(true);
  markTdmMapCollisionMeshes(mapRoot);

  const spawns = extractTdmMapSpawnPoints(mapRoot);
  if (spawns.length > 0) {
    setTdmMapSpawnPoints(spawns);
  } else {
    console.warn('[TdmMap] No spawn_* markers found in tdm_map.glb — using baked defaults');
  }
}
