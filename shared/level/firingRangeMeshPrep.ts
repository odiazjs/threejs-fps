import * as THREE from 'three';
import { isThreeMesh } from './collisionMeshPrep.js';
import { setFiringRangeSpawnPoint } from './firingRangeColliders.js';
import {
  FIRING_RANGE_MAP_SCALE,
  FIRING_RANGE_SPAWN_MARKER,
  isFiringRangeCrateName,
} from './firingRangeConfig.js';
import {
  registerFiringRangePickupsFromCrates,
  type FiringRangeCrateTop,
} from './firingRangePickups.js';
import {
  clearFiringRangeCrateColliders,
  insetCrateColliderAabb,
  registerFiringRangeCrateColliders,
} from './firingRangeCrateColliders.js';
import type { Aabb } from './levelData.js';

const _spawnWorldPos = new THREE.Vector3();
const _crateBox = new THREE.Box3();
const _crateCenter = new THREE.Vector3();

function findChildByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!found && child.name === name) {
      found = child;
    }
  });
  return found;
}

function findCrateBoxNodes(root: THREE.Object3D): THREE.Object3D[] {
  const matches: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (isFiringRangeCrateName(child.name)) {
      matches.push(child);
    }
  });
  return matches;
}

/** Ground-align an imported map root (center XZ, min Y on floor). */
export function groundAlignMapRoot(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function isMeshUnderFiringRangeCrate(mesh: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = mesh;
  while (node) {
    if (isFiringRangeCrateName(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/** Mark every mesh in an editor-exported map as gameplay collision geometry. */
export function markFiringRangeCollisionMeshes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isThreeMesh(child)) return;
    if (child.userData.skipCollision === true) return;
    if (isMeshUnderFiringRangeCrate(child)) {
      child.userData.skipCollision = true;
      return;
    }
    child.userData.collisionMesh = true;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

/** Scale, collision-mark, and ground-align a loaded GLB root. */
export function prepareFiringRangeMapRoot(
  mapRoot: THREE.Object3D,
  scale = FIRING_RANGE_MAP_SCALE,
): THREE.Box3 {
  if (scale !== 1) {
    mapRoot.scale.setScalar(scale);
  }
  markFiringRangeCollisionMeshes(mapRoot);
  const bounds = groundAlignMapRoot(mapRoot);
  registerFiringRangeSpawnFromRoot(mapRoot);
  registerFiringRangePickupsFromRoot(mapRoot);
  return bounds;
}

/** World XZ of the editor spawn empty (after prepareFiringRangeMapRoot). */
export function extractFiringRangeSpawnPoint(
  root: THREE.Object3D,
  markerName = FIRING_RANGE_SPAWN_MARKER,
): { x: number; z: number } | null {
  const marker = findChildByName(root, markerName);
  if (!marker) return null;

  marker.updateWorldMatrix(true, false);
  marker.getWorldPosition(_spawnWorldPos);
  return { x: _spawnWorldPos.x, z: _spawnWorldPos.z };
}

/** Reads `spawn_1` from a prepared map root and updates shared spawn picking. */
export function registerFiringRangeSpawnFromRoot(mapRoot: THREE.Object3D): void {
  const spawn = extractFiringRangeSpawnPoint(mapRoot);
  if (spawn) {
    setFiringRangeSpawnPoint(spawn.x, spawn.z);
    return;
  }
  console.warn(
    `[FiringRange] Spawn marker "${FIRING_RANGE_SPAWN_MARKER}" not found — using map center`,
  );
}

/** World tops of every `crate_box` in the prepared map (center XZ, max Y). */
export function extractFiringRangeCrateTops(root: THREE.Object3D): FiringRangeCrateTop[] {
  const crates = findCrateBoxNodes(root);

  const tops: FiringRangeCrateTop[] = [];
  for (const crate of crates) {
    crate.updateWorldMatrix(true, false);
    _crateBox.setFromObject(crate);
    _crateBox.getCenter(_crateCenter);
    tops.push({
      x: _crateCenter.x,
      z: _crateCenter.z,
      y: _crateBox.max.y,
    });
  }
  return tops;
}

/** Simple cuboid colliders for crate_box props (avoids dense trimesh in walk gaps). */
export function extractFiringRangeCrateColliders(root: THREE.Object3D): Aabb[] {
  const crates = findCrateBoxNodes(root);
  const colliders: Aabb[] = [];

  for (const crate of crates) {
    crate.updateWorldMatrix(true, false);
    _crateBox.setFromObject(crate);
    const collider = insetCrateColliderAabb({
      minX: _crateBox.min.x,
      minY: _crateBox.min.y,
      minZ: _crateBox.min.z,
      maxX: _crateBox.max.x,
      maxY: _crateBox.max.y,
      maxZ: _crateBox.max.z,
    });
    if (collider) colliders.push(collider);
  }

  return colliders;
}

/** Reads `crate_box` anchors and assigns ammo / shield / weapon placements. */
export function registerFiringRangePickupsFromRoot(mapRoot: THREE.Object3D): void {
  clearFiringRangeCrateColliders();
  const colliders = extractFiringRangeCrateColliders(mapRoot);
  registerFiringRangeCrateColliders(colliders);

  const crates = extractFiringRangeCrateTops(mapRoot);
  if (crates.length === 0) {
    console.warn(
      '[FiringRange] No crate_box meshes found — no map pickups',
    );
    return;
  }

  registerFiringRangePickupsFromCrates(crates);
}
