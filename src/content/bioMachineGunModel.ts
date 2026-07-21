import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  cloneFbxWeaponMesh,
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
  prepareFbxWeaponMesh,
} from './fbxWeaponMesh';

const BIO_MACHINE_GUN_MODEL_FILE = 'meshy_lmg_bottom.fbx';
const BIO_MACHINE_GUN_ALBEDO_URL = '/images/weapons/meshy_lmg_texture.png';
const BIO_MACHINE_GUN_NORMAL_URL = '/images/weapons/meshy_lmg_normal.png';
/** Slightly longer barrel fit than the bio-liquid rifle for LMG silhouette (+20%). */
const BIO_MACHINE_GUN_MESH_LENGTH = 3.8 * 1.2 * 1.2;
/**
 * Meshy LMG is authored with the barrel along +X (bio_liquid / bio_lmg / smg are +Z).
 * modelYaw 0 → prepare applies +π so the thin muzzle tip lands on +X like other guns.
 */
const BIO_MACHINE_GUN_MODEL_YAW = 0;

const BIO_MACHINE_GUN_MESH_CONFIG = {
  meshLength: BIO_MACHINE_GUN_MESH_LENGTH,
  modelYaw: BIO_MACHINE_GUN_MODEL_YAW,
  contentName: 'bioMachineGunContent',
  rootName: 'bioMachineGunWeaponRoot',
} as const;

const textureLoader = new THREE.TextureLoader();

let bioMachineGunTemplate: THREE.Group | null = null;
let bioMachineGunLoadPromise: Promise<THREE.Group> | null = null;

function loadTexture(url: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function applyBioMachineGunMaterials(
  root: THREE.Object3D,
  albedo: THREE.Texture,
  normal: THREE.Texture,
): void {
  // Albedo lives on emissive only — base color/specular stay black so the
  // texture reads as self-lit (Meshy-style emission shading).
  const material = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    emissiveMap: albedo,
    normalMap: normal,
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

function loadBioMachineGunTemplate(): Promise<THREE.Group> {
  if (bioMachineGunTemplate) return Promise.resolve(bioMachineGunTemplate);
  if (bioMachineGunLoadPromise) return bioMachineGunLoadPromise;

  bioMachineGunLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(FBX_WEAPON_ASSET_BASE);
    const [fbx, albedo, normal] = await Promise.all([
      loader.loadAsync(fbxWeaponAssetUrl(BIO_MACHINE_GUN_MODEL_FILE)),
      loadTexture(BIO_MACHINE_GUN_ALBEDO_URL, THREE.SRGBColorSpace),
      loadTexture(BIO_MACHINE_GUN_NORMAL_URL, THREE.NoColorSpace),
    ]);
    applyBioMachineGunMaterials(fbx as THREE.Group, albedo, normal);
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
