import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';
import {
  RETHER_PULSE_DIGITAL_SIGHT_MOUNT,
  RETHER_PULSE_SIGHT_TEXTURE,
} from './digitalWeaponSights';

const PISTOL_MODEL_FILE = 'base_basic_shaded.fbx';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * (Procedural weapons use ~1.8–2 unit geometry, then ×0.1 from the loadout.)
 */
const PISTOL_MESH_LENGTH = 1.85;
/** FBX models often face +Z; game weapons point along +X. */
const PISTOL_MODEL_YAW = -Math.PI / 2;

const PISTOL_MESH_CONFIG = {
  meshLength: PISTOL_MESH_LENGTH,
  modelYaw: PISTOL_MODEL_YAW,
  contentName: 'pistolContent',
  rootName: 'pistolWeaponRoot',
} as const;

/** @deprecated Use RETHER_PULSE_* from retherPulseSight — kept for existing imports. */
export const PISTOL_DIGITAL_SIGHT_TEXTURE = RETHER_PULSE_SIGHT_TEXTURE;
/** @deprecated Use RETHER_PULSE_DIGITAL_SIGHT_MOUNT from retherPulseSight. */
export const PISTOL_DIGITAL_SIGHT_MOUNT = RETHER_PULSE_DIGITAL_SIGHT_MOUNT;

let pistolTemplate: THREE.Group | null = null;
let pistolLoadPromise: Promise<THREE.Group> | null = null;

function loadPistolTemplate(): Promise<THREE.Group> {
  if (pistolTemplate) return Promise.resolve(pistolTemplate);
  if (pistolLoadPromise) return pistolLoadPromise;

  pistolLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(PISTOL_MODEL_FILE));
    pistolTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, PISTOL_MESH_CONFIG);
    return pistolTemplate;
  })().finally(() => {
    pistolLoadPromise = null;
  });

  return pistolLoadPromise;
}

export function preloadPistolWeaponModel(): Promise<THREE.Group> {
  return loadPistolTemplate();
}

export function createPistolWeaponMesh(): THREE.Group {
  if (!pistolTemplate) {
    throw new Error('Pistol weapon model not preloaded — call preloadPistolWeaponModel() first');
  }
  return cloneFbxWeaponMesh(pistolTemplate);
}
