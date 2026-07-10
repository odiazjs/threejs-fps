import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const ROOT_BIO_CARBINE_MODEL_FILE = 'lod_root_bio_carbine.fbx';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Slightly shorter than the plasma rifle (carbine proportions).
 */
const ROOT_BIO_CARBINE_MESH_LENGTH = 3.8;
/** FBX models often face +Z; game weapons point along +X. */
const ROOT_BIO_CARBINE_MODEL_YAW = -Math.PI / 2;

const ROOT_BIO_CARBINE_MESH_CONFIG = {
  meshLength: ROOT_BIO_CARBINE_MESH_LENGTH,
  modelYaw: ROOT_BIO_CARBINE_MODEL_YAW,
  contentName: 'rootBioCarbineContent',
  rootName: 'rootBioCarbineWeaponRoot',
} as const;

let rootBioCarbineTemplate: THREE.Group | null = null;
let rootBioCarbineLoadPromise: Promise<THREE.Group> | null = null;

function loadRootBioCarbineTemplate(): Promise<THREE.Group> {
  if (rootBioCarbineTemplate) return Promise.resolve(rootBioCarbineTemplate);
  if (rootBioCarbineLoadPromise) return rootBioCarbineLoadPromise;

  rootBioCarbineLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(ROOT_BIO_CARBINE_MODEL_FILE));
    rootBioCarbineTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, ROOT_BIO_CARBINE_MESH_CONFIG);
    return rootBioCarbineTemplate;
  })().finally(() => {
    rootBioCarbineLoadPromise = null;
  });

  return rootBioCarbineLoadPromise;
}

export function preloadRootBioCarbineWeaponModel(): Promise<THREE.Group> {
  return loadRootBioCarbineTemplate();
}

export function createRootBioCarbineWeaponMesh(): THREE.Group {
  if (!rootBioCarbineTemplate) {
    throw new Error(
      'Root Bio Carbine model not preloaded — call preloadRootBioCarbineWeaponModel() first',
    );
  }
  return cloneFbxWeaponMesh(rootBioCarbineTemplate);
}
