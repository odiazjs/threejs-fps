import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const BIO_SMG_1_MODEL_FILE = 'smg_1.fbx';
/** Compact SMG silhouette — shorter barrel fit than full rifles (+25%). */
const BIO_SMG_1_MESH_LENGTH = 3.8 * 0.85 * 1.3;
const BIO_SMG_1_MODEL_YAW = -Math.PI / 2;

const BIO_SMG_1_MESH_CONFIG = {
  meshLength: BIO_SMG_1_MESH_LENGTH,
  modelYaw: BIO_SMG_1_MODEL_YAW,
  contentName: 'bioSmg1Content',
  rootName: 'bioSmg1WeaponRoot',
} as const;

let bioSmg1Template: THREE.Group | null = null;
let bioSmg1LoadPromise: Promise<THREE.Group> | null = null;

function loadBioSmg1Template(): Promise<THREE.Group> {
  if (bioSmg1Template) return Promise.resolve(bioSmg1Template);
  if (bioSmg1LoadPromise) return bioSmg1LoadPromise;

  bioSmg1LoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(BIO_SMG_1_MODEL_FILE));
    bioSmg1Template = prepareFbxWeaponMesh(fbx as THREE.Group, BIO_SMG_1_MESH_CONFIG);
    return bioSmg1Template;
  })().finally(() => {
    bioSmg1LoadPromise = null;
  });

  return bioSmg1LoadPromise;
}

export function preloadBioSmg1WeaponModel(): Promise<THREE.Group> {
  return loadBioSmg1Template();
}

export function createBioSmg1WeaponMesh(): THREE.Group {
  if (!bioSmg1Template) {
    throw new Error('Bio SMG model not preloaded — call preloadBioSmg1WeaponModel() first');
  }
  return cloneFbxWeaponMesh(bioSmg1Template);
}
