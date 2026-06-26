import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const SNIPER_MODEL_FILE = 'base_sniper_shaded.fbx';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Longer than the assault rifle to match sniper proportions (+20%).
 */
const SNIPER_MESH_LENGTH = 5.4 * 1.2;
/** FBX models often face +Z; game weapons point along +X. */
const SNIPER_MODEL_YAW = -Math.PI / 2;

const SNIPER_MESH_CONFIG = {
  meshLength: SNIPER_MESH_LENGTH,
  modelYaw: SNIPER_MODEL_YAW,
  contentName: 'sniperContent',
  rootName: 'sniperWeaponRoot',
} as const;

let sniperTemplate: THREE.Group | null = null;
let sniperLoadPromise: Promise<THREE.Group> | null = null;

function loadSniperTemplate(): Promise<THREE.Group> {
  if (sniperTemplate) return Promise.resolve(sniperTemplate);
  if (sniperLoadPromise) return sniperLoadPromise;

  sniperLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(SNIPER_MODEL_FILE));
    sniperTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, SNIPER_MESH_CONFIG);
    return sniperTemplate;
  })().finally(() => {
    sniperLoadPromise = null;
  });

  return sniperLoadPromise;
}

export function preloadSniperWeaponModel(): Promise<THREE.Group> {
  return loadSniperTemplate();
}

export function createSniperWeaponMesh(): THREE.Group {
  if (!sniperTemplate) {
    throw new Error('Sniper weapon model not preloaded — call preloadSniperWeaponModel() first');
  }
  return cloneFbxWeaponMesh(sniperTemplate);
}
