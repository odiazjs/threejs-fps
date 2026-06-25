import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const RIFLE_MODEL_FILE = 'base_rifle_shaded.fbx';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Matches procedural plasma rifle extent (~3.8 units along +X), scaled +10%.
 */
const RIFLE_MESH_LENGTH = 3.8 * 1.1;
/** FBX models often face +Z; game weapons point along +X. */
const RIFLE_MODEL_YAW = -Math.PI / 2;

const RIFLE_MESH_CONFIG = {
  meshLength: RIFLE_MESH_LENGTH,
  modelYaw: RIFLE_MODEL_YAW,
  contentName: 'rifleContent',
  rootName: 'rifleWeaponRoot',
} as const;

let rifleTemplate: THREE.Group | null = null;
let rifleLoadPromise: Promise<THREE.Group> | null = null;

function loadRifleTemplate(): Promise<THREE.Group> {
  if (rifleTemplate) return Promise.resolve(rifleTemplate);
  if (rifleLoadPromise) return rifleLoadPromise;

  rifleLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(RIFLE_MODEL_FILE));
    rifleTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, RIFLE_MESH_CONFIG);
    return rifleTemplate;
  })().finally(() => {
    rifleLoadPromise = null;
  });

  return rifleLoadPromise;
}

export function preloadRifleWeaponModel(): Promise<THREE.Group> {
  return loadRifleTemplate();
}

export function createRifleWeaponMesh(): THREE.Group {
  if (!rifleTemplate) {
    throw new Error('Rifle weapon model not preloaded — call preloadRifleWeaponModel() first');
  }
  return cloneFbxWeaponMesh(rifleTemplate);
}
