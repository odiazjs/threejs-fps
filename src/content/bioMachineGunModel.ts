import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const BIO_MACHINE_GUN_MODEL_FILE = 'bio_lmg.fbx';
/** Slightly longer barrel fit than the bio-liquid rifle for LMG silhouette (+20%). */
const BIO_MACHINE_GUN_MESH_LENGTH = 3.8 * 1.2 * 1.2;
const BIO_MACHINE_GUN_MODEL_YAW = -Math.PI / 2;

const BIO_MACHINE_GUN_MESH_CONFIG = {
  meshLength: BIO_MACHINE_GUN_MESH_LENGTH,
  modelYaw: BIO_MACHINE_GUN_MODEL_YAW,
  contentName: 'bioMachineGunContent',
  rootName: 'bioMachineGunWeaponRoot',
} as const;

let bioMachineGunTemplate: THREE.Group | null = null;
let bioMachineGunLoadPromise: Promise<THREE.Group> | null = null;

function loadBioMachineGunTemplate(): Promise<THREE.Group> {
  if (bioMachineGunTemplate) return Promise.resolve(bioMachineGunTemplate);
  if (bioMachineGunLoadPromise) return bioMachineGunLoadPromise;

  bioMachineGunLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(BIO_MACHINE_GUN_MODEL_FILE));
    bioMachineGunTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, BIO_MACHINE_GUN_MESH_CONFIG);
    return bioMachineGunTemplate;
  })().finally(() => {
    bioMachineGunLoadPromise = null;
  });

  return bioMachineGunLoadPromise;
}

export function preloadBioMachineGunWeaponModel(): Promise<THREE.Group> {
  return loadBioMachineGunTemplate();
}

export function createBioMachineGunWeaponMesh(): THREE.Group {
  if (!bioMachineGunTemplate) {
    throw new Error(
      'Bio Machine Gun model not preloaded — call preloadBioMachineGunWeaponModel() first',
    );
  }
  return cloneFbxWeaponMesh(bioMachineGunTemplate);
}
