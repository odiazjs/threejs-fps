import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';
import { configureColorTexture } from './textureQuality';

const SNIPER_MODEL_FILE = 'weapons/sniper_1/sniper_1.fbx';
const SNIPER_EMISSIVE_MAP_URL = '/3d/weapons/sniper_1/sniper_1_texture.png';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * Longer than the assault rifle to match sniper proportions (+20%).
 */
const SNIPER_MESH_LENGTH = 5.4 * 1.2;
/**
 * Meshy sniper is authored with the barrel along +X (same as AR / bio liquid pistol).
 * modelYaw 0 → prepare applies +π so the muzzle tip lands on +X.
 */
const SNIPER_MODEL_YAW = 0;

const SNIPER_MESH_CONFIG = {
  meshLength: SNIPER_MESH_LENGTH,
  modelYaw: SNIPER_MODEL_YAW,
  contentName: 'sniperContent',
  rootName: 'sniperWeaponRoot',
  // Use authored FBX `sight_mount` center only (no synthesized socket).
  sightMount: true,
} as const;

const textureLoader = new THREE.TextureLoader();

let sniperTemplate: THREE.Group | null = null;
let sniperLoadPromise: Promise<THREE.Group> | null = null;

function loadEmissiveTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        configureColorTexture(texture);
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function applySniperMaterials(root: THREE.Object3D, emissiveMap: THREE.Texture): void {
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

function loadSniperTemplate(): Promise<THREE.Group> {
  if (sniperTemplate) return Promise.resolve(sniperTemplate);
  if (sniperLoadPromise) return sniperLoadPromise;

  sniperLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(`${FBX_WEAPON_ASSET_BASE}weapons/sniper_1/`);
    const [fbx, emissiveMap] = await Promise.all([
      loader.loadAsync(fbxWeaponAssetUrl(SNIPER_MODEL_FILE)),
      loadEmissiveTexture(SNIPER_EMISSIVE_MAP_URL),
    ]);
    applySniperMaterials(fbx as THREE.Group, emissiveMap);
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
