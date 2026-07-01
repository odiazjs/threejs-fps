import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const KATANA_MODEL_FILE = 'melee_katana.fbx';
/** Blade length in mesh space before WeaponLoadout's 0.1 viewmodel scale (+75%, then +15%). */
const KATANA_MESH_LENGTH = 2.1 * 1.75 * 1.15;
const KATANA_MODEL_YAW = -Math.PI / 2;

const KATANA_MESH_CONFIG = {
  meshLength: KATANA_MESH_LENGTH,
  modelYaw: KATANA_MODEL_YAW,
  contentName: 'katanaContent',
  rootName: 'katanaWeaponRoot',
} as const;

let katanaTemplate: THREE.Group | null = null;
let katanaLoadPromise: Promise<THREE.Group> | null = null;

function loadKatanaTemplate(): Promise<THREE.Group> {
  if (katanaTemplate) return Promise.resolve(katanaTemplate);
  if (katanaLoadPromise) return katanaLoadPromise;

  katanaLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(KATANA_MODEL_FILE));
    katanaTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, KATANA_MESH_CONFIG);
    return katanaTemplate;
  })().finally(() => {
    katanaLoadPromise = null;
  });

  return katanaLoadPromise;
}

export function preloadKatanaWeaponModel(): Promise<THREE.Group> {
  return loadKatanaTemplate();
}

export function createKatanaWeaponMesh(): THREE.Group {
  if (!katanaTemplate) {
    throw new Error('Katana weapon model not preloaded — call preloadKatanaWeaponModel() first');
  }
  return cloneFbxWeaponMesh(katanaTemplate);
}
