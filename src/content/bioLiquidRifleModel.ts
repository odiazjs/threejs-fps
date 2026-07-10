import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const BIO_LIQUID_RIFLE_MODEL_FILE = 'bio_liquid_rifle.fbx';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Matches plasma rifle fit (+10%).
 */
const BIO_LIQUID_RIFLE_MESH_LENGTH = 3.8 * 1.1;
/** FBX models often face +Z; game weapons point along +X. */
const BIO_LIQUID_RIFLE_MODEL_YAW = -Math.PI / 2;

const BIO_LIQUID_RIFLE_MESH_CONFIG = {
  meshLength: BIO_LIQUID_RIFLE_MESH_LENGTH,
  modelYaw: BIO_LIQUID_RIFLE_MODEL_YAW,
  contentName: 'bioLiquidRifleContent',
  rootName: 'bioLiquidRifleWeaponRoot',
} as const;

let bioLiquidRifleTemplate: THREE.Group | null = null;
let bioLiquidRifleLoadPromise: Promise<THREE.Group> | null = null;

function loadBioLiquidRifleTemplate(): Promise<THREE.Group> {
  if (bioLiquidRifleTemplate) return Promise.resolve(bioLiquidRifleTemplate);
  if (bioLiquidRifleLoadPromise) return bioLiquidRifleLoadPromise;

  bioLiquidRifleLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(BIO_LIQUID_RIFLE_MODEL_FILE));
    bioLiquidRifleTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, BIO_LIQUID_RIFLE_MESH_CONFIG);
    return bioLiquidRifleTemplate;
  })().finally(() => {
    bioLiquidRifleLoadPromise = null;
  });

  return bioLiquidRifleLoadPromise;
}

export function preloadBioLiquidRifleWeaponModel(): Promise<THREE.Group> {
  return loadBioLiquidRifleTemplate();
}

export function createBioLiquidRifleWeaponMesh(): THREE.Group {
  if (!bioLiquidRifleTemplate) {
    throw new Error(
      'Bio-Liquid Rifle model not preloaded — call preloadBioLiquidRifleWeaponModel() first',
    );
  }
  return cloneFbxWeaponMesh(bioLiquidRifleTemplate);
}
