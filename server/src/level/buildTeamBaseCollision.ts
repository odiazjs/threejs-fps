import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { HARVEST_TEAM_BASE_DEFAULT_HEIGHT } from '../../../shared/level/harvestMapConfig.js';
import {
  getTeamBaseSpawns,
  type TeamBaseSpawn,
} from '../../../shared/level/teamBaseSpawns.js';

const TEAM_BASE_FBX: Record<0 | 1, string> = {
  0: 'game_modes/team_base_blue_2.fbx',
  1: 'game_modes/team_base_orange_2.fbx',
};

function normalizeTeamBaseRoot(root: THREE.Group): {
  root: THREE.Group;
  localHeight: number;
} {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return { root, localHeight: Math.max(size.y, 1e-4) };
}

function placeTeamBase(
  content: THREE.Group,
  localHeight: number,
  spawn: TeamBaseSpawn,
): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.name =
    spawn.teamId === 0 ? 'teamBaseBlueCollision' : 'teamBaseOrangeCollision';
  const clone = content.clone(true);
  const height = HARVEST_TEAM_BASE_DEFAULT_HEIGHT;
  clone.scale.setScalar(height / localHeight);
  wrapper.add(clone);
  wrapper.position.set(spawn.x, 0, spawn.z);
  wrapper.rotation.y = spawn.yaw;
  wrapper.updateMatrixWorld(true);

  // Snap feet to y=0 after scale + yaw (same as runtime visual placement).
  const placed = new THREE.Box3().setFromObject(wrapper);
  if (Number.isFinite(placed.min.y)) {
    wrapper.position.y -= placed.min.y;
    wrapper.updateMatrixWorld(true);
  }

  wrapper.traverse((child) => {
    if ((child as THREE.Mesh).isMesh === true) {
      child.userData.collisionMesh = true;
      child.userData.skipCollision = false;
      child.visible = true;
    }
  });
  return wrapper;
}

function loadFbxGroup(assetDir: string, relativePath: string): THREE.Group {
  const modelPath = join(assetDir, relativePath);
  if (!existsSync(modelPath)) {
    throw new Error(`[TeamBaseCollision] Missing ${relativePath} in ${assetDir}`);
  }
  const loader = new FBXLoader();
  const resourcePath = `${pathToFileURL(join(assetDir, 'game_modes', '/')).href}`;
  const bytes = readFileSync(modelPath);
  const parsed = loader.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    resourcePath,
  );
  return parsed as THREE.Group;
}

/**
 * Build world-placed team-base collision roots matching runtime FBX placement.
 */
export function buildTeamBaseCollisionRoots(assetDir: string): THREE.Group[] {
  const spawns = getTeamBaseSpawns();
  const roots: THREE.Group[] = [];

  const templates: Partial<Record<0 | 1, { root: THREE.Group; localHeight: number }>> =
    {};

  for (const spawn of spawns) {
    let template = templates[spawn.teamId];
    if (!template) {
      const raw = loadFbxGroup(assetDir, TEAM_BASE_FBX[spawn.teamId]);
      template = normalizeTeamBaseRoot(raw);
      templates[spawn.teamId] = template;
    }
    roots.push(placeTeamBase(template.root, template.localHeight, spawn));
  }

  return roots;
}
