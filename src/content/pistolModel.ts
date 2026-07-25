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

const PISTOL_MODEL_FILE = 'bio_liquid_pistol_1.fbx';
const PISTOL_EMISSIVE_MAP_URL = '/3d/weapons/bio_liquid_pistol_1_texture.png';
/**
 * Barrel length in mesh space before WeaponLoadout's 0.1 viewmodel scale.
 * (Procedural weapons use ~1.8–2 unit geometry, then ×0.1 from the loadout.)
 */
const PISTOL_MESH_LENGTH = 1.85;
/**
 * Bio liquid pistol is authored with the barrel along +X (same as meshy LMG).
 * modelYaw 0 → prepare applies +π so the muzzle tip lands on +X.
 */
const PISTOL_MODEL_YAW = 0;

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

const textureLoader = new THREE.TextureLoader();

let pistolTemplate: THREE.Group | null = null;
let pistolLoadPromise: Promise<THREE.Group> | null = null;

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

function applyPistolMaterials(root: THREE.Object3D, emissiveMap: THREE.Texture): void {
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

function loadPistolTemplate(): Promise<THREE.Group> {
  if (pistolTemplate) return Promise.resolve(pistolTemplate);
  if (pistolLoadPromise) return pistolLoadPromise;

  pistolLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const [fbx, emissiveMap] = await Promise.all([
      loader.loadAsync(fbxWeaponAssetUrl(PISTOL_MODEL_FILE)),
      loadEmissiveTexture(PISTOL_EMISSIVE_MAP_URL),
    ]);
    applyPistolMaterials(fbx as THREE.Group, emissiveMap);
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
