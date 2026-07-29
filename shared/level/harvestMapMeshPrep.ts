import * as THREE from 'three';
import { isThreeMesh } from './collisionMeshPrep.js';
import {
  HARVEST_MAP_SCALE,
  isHarvestMapBackgroundName,
  isHarvestMapEditorJunkName,
  isHarvestMapEmbeddedStationName,
  isHarvestMapHarvestingBoxName,
  isHarvestMapSpawnName,
} from './harvestMapConfig.js';
import {
  setHarvestMapSpawnPoints,
  type HarvestSpawnPoint,
} from './harvestMapColliders.js';
import {
  yawForHarvestCraftingStation,
  type CraftingStationSpawn,
} from './craftingStationSpawns.js';
import {
  harvestingBoxTeamFromName,
  type HarvestingBoxSpawn,
} from './harvestingBoxSpawns.js';

const _spawnWorldPos = new THREE.Vector3();

function isUnderNamedNode(
  object: THREE.Object3D,
  predicate: (name: string | undefined) => boolean,
): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (predicate(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Mark gameplay collision meshes in harvest_map.glb.
 * RocksBG / rock dressing and the editor player armature are never collidable.
 */
export function markHarvestMapCollisionMeshes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isThreeMesh(child)) return;
    if (
      isUnderNamedNode(child, isHarvestMapBackgroundName) ||
      isUnderNamedNode(child, isHarvestMapEditorJunkName) ||
      isUnderNamedNode(child, isHarvestMapEmbeddedStationName) ||
      isUnderNamedNode(child, isHarvestMapHarvestingBoxName)
    ) {
      child.userData.skipCollision = true;
      return;
    }
    child.userData.collisionMesh = true;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

/** Hide the leftover Mixamo player used as an editor scale reference. */
export function hideHarvestMapEditorJunk(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapEditorJunkName(child.name)) return;
    child.visible = false;
  });
}

/** Hide embedded craft meshes - runtime FBX stations replace them. */
export function hideHarvestMapEmbeddedStations(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapEmbeddedStationName(child.name)) return;
    child.visible = false;
  });
}

/** Hide embedded harvesting crate meshes  runtime FBX replaces them. */
export function hideHarvestMapHarvestingBoxes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapHarvestingBoxName(child.name)) return;
    child.visible = false;
  });
}

export function extractHarvestMapSpawnPoints(
  root: THREE.Object3D,
): HarvestSpawnPoint[] {
  const points: HarvestSpawnPoint[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!isHarvestMapSpawnName(child.name)) return;
    child.getWorldPosition(_spawnWorldPos);
    points.push({ x: _spawnWorldPos.x, z: _spawnWorldPos.z });
  });
  return points;
}

/**
 * World poses for `crafting_station` markers  xz from authored pivots.
 * Y is ignored at spawn (stations sit on the ground).
 */
export function extractHarvestMapCraftingStationSpawns(
  root: THREE.Object3D,
): CraftingStationSpawn[] {
  const stations: CraftingStationSpawn[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!isHarvestMapEmbeddedStationName(child.name)) return;
    child.getWorldPosition(_spawnWorldPos);
    const x = _spawnWorldPos.x;
    const z = _spawnWorldPos.z;
    stations.push({
      x,
      y: 0,
      z,
      yaw: yawForHarvestCraftingStation(x, z),
    });
  });
  return stations;
}

/**
 * World poses for `harvesting_box_orange` / `harvesting_box_blue` markers.
 * Keeps authored Y so crates sit on elevated team bases.
 */
export function extractHarvestMapHarvestingBoxSpawns(
  root: THREE.Object3D,
): HarvestingBoxSpawn[] {
  const boxes: HarvestingBoxSpawn[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!isHarvestMapHarvestingBoxName(child.name)) return;
    const teamId = harvestingBoxTeamFromName(child.name);
    if (teamId === null) return;
    child.getWorldPosition(_spawnWorldPos);
    boxes.push({
      index: teamId === 1 ? 0 : 1,
      teamId,
      x: _spawnWorldPos.x,
      y: _spawnWorldPos.y,
      z: _spawnWorldPos.z,
    });
  });
  boxes.sort((a, b) => a.index - b.index);
  return boxes;
}

export function prepareHarvestMapRoot(
  mapRoot: THREE.Object3D,
  scale = HARVEST_MAP_SCALE,
): void {
  if (scale !== 1) {
    mapRoot.scale.setScalar(scale);
  }
  mapRoot.updateMatrixWorld(true);
  markHarvestMapCollisionMeshes(mapRoot);
  hideHarvestMapEditorJunk(mapRoot);
  hideHarvestMapEmbeddedStations(mapRoot);
  hideHarvestMapHarvestingBoxes(mapRoot);

  const spawns = extractHarvestMapSpawnPoints(mapRoot);
  if (spawns.length > 0) {
    setHarvestMapSpawnPoints(spawns);
  } else {
    console.warn(
      '[HarvestMap] No spawn / spawn_N markers found - using baked defaults',
    );
  }
}
