import * as THREE from 'three';
import { isThreeMesh } from './collisionMeshPrep.js';
import {
  HARVEST_MAP_SCALE,
  HARVEST_TEAM_BASE_DEFAULT_HEIGHT,
  isHarvestMapBackgroundName,
  isHarvestMapEditorJunkName,
  isHarvestMapEmbeddedStationName,
  isHarvestMapHarvestingBoxName,
  isHarvestMapOwnBoxSpawnName,
  isHarvestMapInstallBoxPosName,
  isHarvestMapSpawnName,
  isHarvestMapTeamBaseName,
  harvestTeamBaseTeamId,
  isHarvestMapHillWallName,
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
const _baseBox = new THREE.Box3();
const _baseSize = new THREE.Vector3();

export interface HarvestTeamBaseAnchor {
  readonly teamId: 0 | 1;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** World feet Y (marker origin or proxy AABB min). */
  readonly groundY: number;
  /** World AABB size of the marker / proxy (drives FBX uniform scale). */
  readonly size: THREE.Vector3;
}

/**
 * Poses from the previous embedded `team_base_blue` / `team_base_orange` meshes.
 * Used only when the current GLB has no team-base markers.
 */
const HARVEST_TEAM_BASE_FALLBACK_ANCHORS: readonly HarvestTeamBaseAnchor[] = [
  {
    teamId: 0,
    position: new THREE.Vector3(-16.019567, 0, -19.410256),
    quaternion: new THREE.Quaternion(0, 0, 0, 1),
    groundY: 0,
    size: new THREE.Vector3(5, 5, 5),
  },
  {
    teamId: 1,
    position: new THREE.Vector3(17.129193, 0, 19.209421),
    quaternion: new THREE.Quaternion(0, 1, 0, 0),
    groundY: 0,
    size: new THREE.Vector3(5, 5, 5),
  },
];

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
      isUnderNamedNode(child, isHarvestMapHarvestingBoxName) ||
      isUnderNamedNode(child, isHarvestMapTeamBaseName) ||
      isUnderNamedNode(child, isHarvestMapHillWallName)
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

function findChildByNamePredicate(
  parent: THREE.Object3D,
  predicate: (name: string | undefined) => boolean,
): THREE.Object3D | null {
  for (const child of parent.children) {
    if (predicate(child.name)) return child;
  }
  // Blender may nest empties one level deeper.
  for (const child of parent.children) {
    for (const grand of child.children) {
      if (predicate(grand.name)) return grand;
    }
  }
  return null;
}

/**
 * Prefer `base_own_box_spawn` + `base_install_box_pos` under each team base.
 * Falls back to legacy `harvesting_box_orange` / `harvesting_box_blue` markers.
 */
export function extractHarvestMapHarvestingBoxSpawns(
  root: THREE.Object3D,
): HarvestingBoxSpawn[] {
  root.updateWorldMatrix(true, true);

  type PartialBox = {
    teamId: 0 | 1;
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

    const entry: PartialBox = byTeam.get(teamId) ?? { teamId };
    const own = findChildByNamePredicate(child, isHarvestMapOwnBoxSpawnName);
    if (own) {
      own.getWorldPosition(_spawnWorldPos);
      entry.x = _spawnWorldPos.x;
      entry.y = _spawnWorldPos.y;
      entry.z = _spawnWorldPos.z;
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

  // Legacy flat markers fill any missing team homes.
  root.traverse((child) => {
    if (!isHarvestMapHarvestingBoxName(child.name)) return;
    const teamId = harvestingBoxTeamFromName(child.name);
    if (teamId !== 0 && teamId !== 1) return;
    const entry: PartialBox = byTeam.get(teamId) ?? { teamId };
    if (entry.x === undefined) {
      child.getWorldPosition(_spawnWorldPos);
      entry.x = _spawnWorldPos.x;
      entry.y = _spawnWorldPos.y;
      entry.z = _spawnWorldPos.z;
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
 * arena floor (y=0). Box child empties are for crates, not base elevation.
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
      // Empty marker: xz + yaw from the empty; feet on the arena floor.
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
  if (anchors.length > 0) return anchors;
  return HARVEST_TEAM_BASE_FALLBACK_ANCHORS.map((a) => ({
    teamId: a.teamId,
    position: a.position.clone(),
    quaternion: a.quaternion.clone(),
    groundY: a.groundY,
    size: a.size.clone(),
  }));
}

/** Hide team-base markers  runtime FBX replaces them. */
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
    // Prefer geometric center for placement (FBX is origin-centered).
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

/** Hide authored hill wall  runtime FBX replaces it. */
export function hideHarvestMapHillWalls(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!isHarvestMapHillWallName(child.name)) return;
    child.visible = false;
  });
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
  hideHarvestMapTeamBases(mapRoot);
  hideHarvestMapHillWalls(mapRoot);

  const spawns = extractHarvestMapSpawnPoints(mapRoot);
  if (spawns.length > 0) {
    setHarvestMapSpawnPoints(spawns);
  } else {
    console.warn(
      '[HarvestMap] No spawn / spawn_N markers found - using baked defaults',
    );
  }
}
