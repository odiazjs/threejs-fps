import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const RIFLE_MODEL_FILE = 'weapons/assault_rifle_1/ar_1.fbx';
const RIFLE_EMISSIVE_MAP_URL = '/3d/weapons/assault_rifle_1/ar_1_texture.png';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Base ~3.8 along +X, then +10% legacy fit, then +10% for the new Meshy AR.
 */
const RIFLE_MESH_LENGTH = 3.8 * 1.1 * 1.1;
/**
 * Meshy AR is authored with the barrel along +X (same as bio liquid pistol / LMG).
 * modelYaw 0 → prepare applies +π so the muzzle tip lands on +X.
 */
const RIFLE_MODEL_YAW = 0;

const RIFLE_MESH_CONFIG = {
  meshLength: RIFLE_MESH_LENGTH,
  modelYaw: RIFLE_MODEL_YAW,
  contentName: 'rifleContent',
  rootName: 'rifleWeaponRoot',
  // Use authored FBX `sight_mount` center only (no synthesized socket).
  sightMount: true,
} as const;

const textureLoader = new THREE.TextureLoader();

let rifleTemplate: THREE.Group | null = null;
let rifleLoadPromise: Promise<THREE.Group> | null = null;

function loadEmissiveTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function applyRifleMaterials(root: THREE.Object3D, emissiveMap: THREE.Texture): void {
  // Albedo lives on emissive only — base color/specular stay black so the
  // texture reads as self-lit (Meshy-style emission shading).
  const material = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    emissiveMap,
    shininess: 0,
  });

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      for (const old of child.material) old.dispose();
    } else {
      child.material.dispose();
    }
    child.material = material;
  });
}

function loadRifleTemplate(): Promise<THREE.Group> {
  if (rifleTemplate) return Promise.resolve(rifleTemplate);
  if (rifleLoadPromise) return rifleLoadPromise;

  rifleLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(`${FBX_WEAPON_ASSET_BASE}weapons/assault_rifle_1/`);
    const [fbx, emissiveMap] = await Promise.all([
      loader.loadAsync(fbxWeaponAssetUrl(RIFLE_MODEL_FILE)),
      loadEmissiveTexture(RIFLE_EMISSIVE_MAP_URL),
    ]);
    applyRifleMaterials(fbx as THREE.Group, emissiveMap);
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
