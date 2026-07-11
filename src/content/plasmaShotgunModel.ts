import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const PLASMA_SHOTGUN_MODEL_FILE = 'lod_plasma_shotgun.fbx';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Slightly chunkier than the plasma rifle so the scattergun reads clearly.
 */
const PLASMA_SHOTGUN_MESH_LENGTH = 3.8 * 1.12;
/** FBX models often face +Z; game weapons point along +X. */
const PLASMA_SHOTGUN_MODEL_YAW = -Math.PI / 2;

const PLASMA_SHOTGUN_MESH_CONFIG = {
  meshLength: PLASMA_SHOTGUN_MESH_LENGTH,
  modelYaw: PLASMA_SHOTGUN_MODEL_YAW,
  contentName: 'plasmaShotgunContent',
  rootName: 'plasmaShotgunWeaponRoot',
} as const;

let plasmaShotgunTemplate: THREE.Group | null = null;
let plasmaShotgunLoadPromise: Promise<THREE.Group> | null = null;

function loadPlasmaShotgunTemplate(): Promise<THREE.Group> {
  if (plasmaShotgunTemplate) return Promise.resolve(plasmaShotgunTemplate);
  if (plasmaShotgunLoadPromise) return plasmaShotgunLoadPromise;

  plasmaShotgunLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const fbx = await loader.loadAsync(fbxWeaponAssetUrl(PLASMA_SHOTGUN_MODEL_FILE));
    plasmaShotgunTemplate = prepareFbxWeaponMesh(fbx as THREE.Group, PLASMA_SHOTGUN_MESH_CONFIG);
    return plasmaShotgunTemplate;
  })().finally(() => {
    plasmaShotgunLoadPromise = null;
  });

  return plasmaShotgunLoadPromise;
}

export function preloadPlasmaShotgunWeaponModel(): Promise<THREE.Group> {
  return loadPlasmaShotgunTemplate();
}

export function createPlasmaShotgunWeaponMesh(): THREE.Group {
  if (!plasmaShotgunTemplate) {
    throw new Error(
      'Plasma Shotgun model not preloaded — call preloadPlasmaShotgunWeaponModel() first',
    );
  }
  return cloneFbxWeaponMesh(plasmaShotgunTemplate);
}
