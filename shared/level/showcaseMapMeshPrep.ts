import * as THREE from 'three';
import { isThreeMesh } from './collisionMeshPrep.js';
import { setShowcaseMapSpawnPoint } from './showcaseMapColliders.js';
import {
  SHOWCASE_MAP_SCALE,
  SHOWCASE_MAP_SPAWN_MARKER,
  isShowcaseMapSpawnName,
} from './showcaseMapConfig.js';
import { collectLevelCollisionMeshes } from './levelMeshCollisionUtils.js';
import type { Aabb } from './levelData.js';

function isShowcaseEditorJunkName(name: string | undefined): boolean {
  if (typeof name !== 'string') return false;
  const lower = name.trim().toLowerCase();
  return (
    lower === 'character' ||
    lower.startsWith('character_') ||
    lower === 'temp' ||
    lower.startsWith('mixamorig') ||
    lower === 'player' ||
    lower === 'blue_spawn_group' ||
    lower === 'orange_spawn_group'
  );
}

const _spawnWorldPos = new THREE.Vector3();
const _structuralBox = new THREE.Box3();

function findChildByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  const target = name.toLowerCase();
  root.traverse((child) => {
    if (!found && child.name.trim().toLowerCase() === target) {
      found = child;
    }
  });
  return found;
}

function markSubtreeNonCollision(root: THREE.Object3D): void {
  root.traverse((child) => {
    child.visible = false;
    if (isThreeMesh(child)) {
      child.userData.skipCollision = true;
      child.userData.collisionMesh = false;
    }
  });
}

/**
 * Bounds from gameplay collision meshes only — skips hidden editor junk /
 * characters so they cannot shift ground-align.
 */
function collisionBoundsFromRoot(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  let hasMesh = false;
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!isThreeMesh(child)) return;
    if (child.userData.skipCollision === true) return;
    if (child.userData.collisionMesh !== true) return;
    box.expandByObject(child);
    hasMesh = true;
  });
  if (!hasMesh) {
    return new THREE.Box3().setFromObject(root);
  }
  return box;
}

/** Ground-align an imported map root (center XZ, min Y on floor). */
export function groundAlignShowcaseMapRoot(root: THREE.Object3D): THREE.Box3 {
  const box = collisionBoundsFromRoot(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return collisionBoundsFromRoot(root);
}

/**
 * Mark gameplay collision meshes. Editor junk / characters / spawn empties
 * (and their full subtrees) are excluded.
 */
export function markShowcaseMapCollisionMeshes(root: THREE.Object3D): void {
  const skipRoots: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (isShowcaseEditorJunkName(child.name) || isShowcaseMapSpawnName(child.name)) {
      skipRoots.push(child);
    }
  });
  for (const skipRoot of skipRoots) {
    markSubtreeNonCollision(skipRoot);
  }

  root.traverse((child) => {
    if (!isThreeMesh(child)) return;
    if (child.userData.skipCollision === true) return;
    // Skinned character leftovers should never enter the trimesh bake.
    if ((child as THREE.SkinnedMesh).isSkinnedMesh === true) {
      child.userData.skipCollision = true;
      child.userData.collisionMesh = false;
      child.visible = false;
      return;
    }
    child.userData.collisionMesh = true;
    child.castShadow = false;
    child.receiveShadow = true;
  });
}

/** Scale, collision-mark, ground-align, and register spawn. */
export function prepareShowcaseMapRoot(
  mapRoot: THREE.Object3D,
  scale = SHOWCASE_MAP_SCALE,
): THREE.Box3 {
  if (scale !== 1) {
    mapRoot.scale.setScalar(scale);
  }
  markShowcaseMapCollisionMeshes(mapRoot);
  const bounds = groundAlignShowcaseMapRoot(mapRoot);
  registerShowcaseMapSpawnFromRoot(mapRoot);
  return bounds;
}

export function extractShowcaseMapSpawnPoint(
  root: THREE.Object3D,
  markerName = SHOWCASE_MAP_SPAWN_MARKER,
): { x: number; z: number } | null {
  const preferred = findChildByName(root, markerName);
  if (preferred) {
    preferred.updateWorldMatrix(true, false);
    preferred.getWorldPosition(_spawnWorldPos);
    return { x: _spawnWorldPos.x, z: _spawnWorldPos.z };
  }

  // Legacy / numbered empties: player_spawn1, player_spawn_1, …
  let fallback: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!fallback && isShowcaseMapSpawnName(child.name)) {
      fallback = child;
    }
  });
  if (!fallback) return null;

  fallback.updateWorldMatrix(true, false);
  fallback.getWorldPosition(_spawnWorldPos);
  return { x: _spawnWorldPos.x, z: _spawnWorldPos.z };
}

export function registerShowcaseMapSpawnFromRoot(mapRoot: THREE.Object3D): void {
  const spawn = extractShowcaseMapSpawnPoint(mapRoot);
  if (spawn) {
    setShowcaseMapSpawnPoint(spawn.x, spawn.z);
    return;
  }
  console.warn(
    `[ShowcaseMap] Spawn marker "${SHOWCASE_MAP_SPAWN_MARKER}" not found — using map center`,
  );
}

export function extractShowcaseMapStructuralBoxes(root: THREE.Object3D): Aabb[] {
  const meshes = collectLevelCollisionMeshes([root]);
  const boxes: Aabb[] = [];

  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    _structuralBox.setFromObject(mesh);
    if (_structuralBox.isEmpty()) continue;

    boxes.push({
      minX: _structuralBox.min.x,
      minY: _structuralBox.min.y,
      minZ: _structuralBox.min.z,
      maxX: _structuralBox.max.x,
      maxY: _structuralBox.max.y,
      maxZ: _structuralBox.max.z,
    });
  }

  return boxes;
}
