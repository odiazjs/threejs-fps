import * as THREE from 'three';
import { isThreeMesh } from './collisionMeshPrep.js';
import {
  HARVEST_MAP_SCALE,
  HARVEST_TEAM_BASE_DEFAULT_HEIGHT,
  isHarvestMapBackgroundName,
  isHarvestMapBlueSpawnGroupName,
  isHarvestMapEditorJunkName,
  isHarvestMapEmbeddedStationName,
  isHarvestMapEmbeddedStationPropName,
  isHarvestMapHarvestingBoxName,
  isHarvestMapOwnBoxSpawnName,
  isHarvestMapInstallBoxPosName,
  isHarvestMapOrangeSpawnGroupName,
  isHarvestMapSpawnName,
  isHarvestMapTeamBaseName,
  harvestTeamBaseTeamId,
  isHarvestMapHillWallName,
} from './harvestMapConfig.js';
import {
  setHarvestMapTeamSpawnPoints,
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
import { collectLevelCollisionMeshes } from './levelMeshCollisionUtils.js';
import type { Aabb } from './levelData.js';

const _spawnWorldPos = new THREE.Vector3();
const _baseBox = new THREE.Box3();
const _baseSize = new THREE.Vector3();
const _structuralBox = new THREE.Box3();

export interface HarvestTeamBaseAnchor {
  readonly teamId: 0 | 1;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** World feet Y (marker origin or proxy AABB min). */
  readonly groundY: number;
  /** World AABB size of the marker / proxy (drives FBX uniform scale). */
  readonly size: THREE.Vector3;
}

export interface HarvestTeamSpawnPoints {
  readonly blue: HarvestSpawnPoint[];
  readonly orange: HarvestSpawnPoint[];
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
 * Bounds from gameplay collision meshes only � skips hidden editor junk /
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
export function groundAlignHarvestMapRoot(root: THREE.Object3D): THREE.Box3 {
  const box = collisionBoundsFromRoot(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return collisionBoundsFromRoot(root);
}

/**
 * Mark gameplay collision meshes in harvest_map.glb.
 * RocksBG / rock dressing, editor junk, spawns, craft/box markers are excluded.
 */
export function markHarvestMapCollisionMeshes(root: THREE.Object3D): void {
  const skipRoots: THREE.Object3D[] = [];
  const backgroundRoots: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (isHarvestMapBackgroundName(child.name)) {
      backgroundRoots.push(child);
      return;
    }
    if (
      isHarvestMapEditorJunkName(child.name) ||
      isHarvestMapSpawnName(child.name) ||
      isHarvestMapEmbeddedStationName(child.name) ||
      isHarvestMapEmbeddedStationPropName(child.name) ||
      isHarvestMapHarvestingBoxName(child.name) ||
      isHarvestMapInstallBoxPosName(child.name) ||
      isHarvestMapTeamBaseName(child.name) ||
      isHarvestMapHillWallName(child.name)
    ) {
      skipRoots.push(child);
    }
  });
  for (const skipRoot of skipRoots) {
    markSubtreeNonCollision(skipRoot);
  }
  for (const bg of backgroundRoots) {
    bg.traverse((child) => {
      if (!isThreeMesh(child)) return;
      child.userData.skipCollision = true;
      child.userData.collisionMesh = false;
    });
  }

  root.traverse((child) => {
    if (!isThreeMesh(child)) return;
    if (child.userData.skipCollision === true) return;
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

/** Hide the leftover Mixamo / character used as an editor scale reference. */
export function hideHarvestMapEditorJunk(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapEditorJunkName(child.name)) return;
    child.visible = false;
  });
}

/** Hide embedded craft empties / props - runtime GLB stations replace them. */
export function hideHarvestMapEmbeddedStations(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (
      !isHarvestMapEmbeddedStationName(child.name) &&
      !isHarvestMapEmbeddedStationPropName(child.name)
    ) {
      return;
    }
    child.visible = false;
  });
}

/** Hide embedded harvesting crate / install empties � runtime FBX replaces them. */
export function hideHarvestMapHarvestingBoxes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (
      !isHarvestMapHarvestingBoxName(child.name) &&
      !isHarvestMapInstallBoxPosName(child.name)
    ) {
      return;
    }
    child.visible = false;
  });
}

function collectSpawnsUnderGroup(
  group: THREE.Object3D,
): HarvestSpawnPoint[] {
  const points: HarvestSpawnPoint[] = [];
  group.traverse((child) => {
    if (child === group) return;
    if (!isHarvestMapSpawnName(child.name)) return;
    child.getWorldPosition(_spawnWorldPos);
    points.push({ x: _spawnWorldPos.x, z: _spawnWorldPos.z });
  });
  return points;
}

/**
 * Team spawn pools from `blue_spawn_group` / `orange_spawn_group`.
 * Falls back to any `player_spawn*` empties split by Z sign when groups missing.
 */
export function extractHarvestMapTeamSpawnPoints(
  root: THREE.Object3D,
): HarvestTeamSpawnPoints {
  root.updateWorldMatrix(true, true);
  let blue: HarvestSpawnPoint[] = [];
  let orange: HarvestSpawnPoint[] = [];

  root.traverse((child) => {
    if (isHarvestMapBlueSpawnGroupName(child.name) && blue.length === 0) {
      blue = collectSpawnsUnderGroup(child);
    }
    if (isHarvestMapOrangeSpawnGroupName(child.name) && orange.length === 0) {
      orange = collectSpawnsUnderGroup(child);
    }
  });

  if (blue.length === 0 && orange.length === 0) {
    const all = extractHarvestMapSpawnPoints(root);
    blue = all.filter((p) => p.z >= 0);
    orange = all.filter((p) => p.z < 0);
  }

  return { blue, orange };
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
 * World poses for `crafting_station_*` markers � xz from authored pivots.
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

function findChildByNamePredicate(
  parent: THREE.Object3D,
  predicate: (name: string | undefined) => boolean,
): THREE.Object3D | null {
  for (const child of parent.children) {
    if (predicate(child.name)) return child;
  }
  for (const child of parent.children) {
    for (const grand of child.children) {
      if (predicate(grand.name)) return grand;
    }
  }
  return null;
}

function boxHomePriority(name: string): number {
  const lower = name.trim().toLowerCase();
  // Prefer numbered blue home (`harvesting_box_blue_1`) over bare `harvesting_box_blue`.
  if (/^harvesting_box_blue_\d+$/i.test(lower)) return 2;
  if (lower === 'harvesting_box_blue' || lower === 'harvesting_box_orange') return 1;
  return 0;
}

/**
 * Prefer side-group `harvesting_box_*` + `*_install` markers.
 * Also accepts legacy `base_own_box_spawn` / `base_install_box_pos` under team bases.
 */
export function extractHarvestMapHarvestingBoxSpawns(
  root: THREE.Object3D,
): HarvestingBoxSpawn[] {
  root.updateWorldMatrix(true, true);

  type PartialBox = {
    teamId: 0 | 1;
    homePriority: number;
    x?: number;
    y?: number;
    z?: number;
    installX?: number;
    installY?: number;
    installZ?: number;
  };
  const byTeam = new Map<0 | 1, PartialBox>();

  root.traverse((child) => {
    if (!isHarvestMapTeamBaseName(child.name)) return;
    const teamId = harvestTeamBaseTeamId(child.name);
    if (teamId === null) return;

    const entry: PartialBox = byTeam.get(teamId) ?? { teamId, homePriority: 0 };
    const own = findChildByNamePredicate(child, isHarvestMapOwnBoxSpawnName);
    if (own) {
      own.getWorldPosition(_spawnWorldPos);
      entry.x = _spawnWorldPos.x;
      entry.y = _spawnWorldPos.y;
      entry.z = _spawnWorldPos.z;
      entry.homePriority = 1;
    }
    const install = findChildByNamePredicate(child, isHarvestMapInstallBoxPosName);
    if (install) {
      install.getWorldPosition(_spawnWorldPos);
      entry.installX = _spawnWorldPos.x;
      entry.installY = _spawnWorldPos.y;
      entry.installZ = _spawnWorldPos.z;
    }
    byTeam.set(teamId, entry);
  });

  root.traverse((child) => {
    if (isHarvestMapInstallBoxPosName(child.name)) {
      const teamId = /blue/i.test(child.name) ? 0 : /orange/i.test(child.name) ? 1 : null;
      if (teamId === null) return;
      const entry: PartialBox = byTeam.get(teamId) ?? { teamId, homePriority: 0 };
      child.getWorldPosition(_spawnWorldPos);
      entry.installX = _spawnWorldPos.x;
      entry.installY = _spawnWorldPos.y;
      entry.installZ = _spawnWorldPos.z;
      byTeam.set(teamId, entry);
      return;
    }

    if (!isHarvestMapHarvestingBoxName(child.name)) return;
    const teamId = harvestingBoxTeamFromName(child.name);
    if (teamId !== 0 && teamId !== 1) return;
    const priority = boxHomePriority(child.name);
    const entry: PartialBox = byTeam.get(teamId) ?? { teamId, homePriority: 0 };
    if (entry.x === undefined || priority >= entry.homePriority) {
      child.getWorldPosition(_spawnWorldPos);
      entry.x = _spawnWorldPos.x;
      entry.y = _spawnWorldPos.y;
      entry.z = _spawnWorldPos.z;
      entry.homePriority = priority;
    }
    byTeam.set(teamId, entry);
  });

  const boxes: HarvestingBoxSpawn[] = [];
  for (const entry of byTeam.values()) {
    if (
      entry.x === undefined ||
      entry.y === undefined ||
      entry.z === undefined
    ) {
      continue;
    }
    const installX = entry.installX ?? entry.x;
    const installY = entry.installY ?? entry.y;
    const installZ = entry.installZ ?? entry.z;
    boxes.push({
      index: entry.teamId === 1 ? 0 : 1,
      teamId: entry.teamId,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      installX,
      installY,
      installZ,
    });
  }
  boxes.sort((a, b) => a.index - b.index);
  return boxes;
}

/**
 * World pose for `team_blue_base` / `team_orange_base` markers.
 * Empty markers use {@link HARVEST_TEAM_BASE_DEFAULT_HEIGHT} with feet on the
 * arena floor (y=0). Returns [] when the map has no team-base markers.
 */
export function extractHarvestMapTeamBaseAnchors(
  root: THREE.Object3D,
): HarvestTeamBaseAnchor[] {
  const anchors: HarvestTeamBaseAnchor[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!isHarvestMapTeamBaseName(child.name)) return;
    const teamId = harvestTeamBaseTeamId(child.name);
    if (teamId === null) return;

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    child.getWorldPosition(position);
    child.getWorldQuaternion(quaternion);
    _baseBox.setFromObject(child);
    _baseBox.getSize(_baseSize);

    let groundY = 0;
    const size = _baseSize.clone();
    if (!_baseBox.isEmpty() && _baseSize.y > 0.2) {
      _baseBox.getCenter(position);
      groundY = _baseBox.min.y;
    } else {
      const height = HARVEST_TEAM_BASE_DEFAULT_HEIGHT;
      size.set(height, height, height);
      groundY = 0;
    }

    anchors.push({
      teamId,
      position: position.clone(),
      quaternion: quaternion.clone(),
      groundY,
      size,
    });
  });
  return anchors;
}

/** Hide team-base markers � runtime FBX replaces them. */
export function hideHarvestMapTeamBases(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapTeamBaseName(child.name)) return;
    child.visible = false;
  });
}

export interface HarvestHillWallAnchor {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly size: THREE.Vector3;
}

/**
 * World pose + AABB size for the authored `hill_wall` mesh.
 */
export function extractHarvestMapHillWallAnchors(
  root: THREE.Object3D,
): HarvestHillWallAnchor[] {
  const anchors: HarvestHillWallAnchor[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!isHarvestMapHillWallName(child.name)) return;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    child.getWorldPosition(position);
    child.getWorldQuaternion(quaternion);
    _baseBox.setFromObject(child);
    _baseBox.getSize(_baseSize);
    if (!_baseBox.isEmpty()) {
      _baseBox.getCenter(position);
    }
    anchors.push({
      position: position.clone(),
      quaternion: quaternion.clone(),
      size: _baseSize.clone(),
    });
  });
  return anchors;
}

/** Hide authored hill wall � runtime FBX replaces it. */
export function hideHarvestMapHillWalls(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapHillWallName(child.name)) return;
    child.visible = false;
  });
}

export function extractHarvestMapStructuralBoxes(root: THREE.Object3D): Aabb[] {
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

export function registerHarvestMapSpawnsFromRoot(mapRoot: THREE.Object3D): void {
  const { blue, orange } = extractHarvestMapTeamSpawnPoints(mapRoot);
  if (blue.length > 0 || orange.length > 0) {
    setHarvestMapTeamSpawnPoints(blue, orange);
    return;
  }
  console.warn(
    '[HarvestMap] No blue_spawn_group / orange_spawn_group player_spawn markers � using baked defaults',
  );
}

export function prepareHarvestMapRoot(
  mapRoot: THREE.Object3D,
  scale = HARVEST_MAP_SCALE,
): THREE.Box3 {
  if (scale !== 1) {
    mapRoot.scale.setScalar(scale);
  }
  markHarvestMapCollisionMeshes(mapRoot);
  hideHarvestMapEditorJunk(mapRoot);
  hideHarvestMapEmbeddedStations(mapRoot);
  hideHarvestMapHarvestingBoxes(mapRoot);
  hideHarvestMapTeamBases(mapRoot);
  hideHarvestMapHillWalls(mapRoot);
  const bounds = groundAlignHarvestMapRoot(mapRoot);
  registerHarvestMapSpawnsFromRoot(mapRoot);
  return bounds;
}
