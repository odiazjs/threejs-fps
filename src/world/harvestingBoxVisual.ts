import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { FBX_WEAPON_ASSET_BASE } from '../content/fbxWeaponMesh';
import { configureColorTexture } from '../content/textureQuality';

const BOX_FBX = 'game_modes/harvesting_box.fbx';
const BOX_TEXTURE = '/3d/game_modes/harvesting_box_texture.png';

const textureLoader = new THREE.TextureLoader();

let boxTemplate: THREE.Group | null = null;
let boxLoadPromise: Promise<THREE.Group> | null = null;

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

function applyBoxMaterials(
  root: THREE.Object3D,
  emissiveMap: THREE.Texture | null,
): void {
  const material = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: emissiveMap ? 0xffffff : 0x66e0ff,
    emissiveIntensity: 1,
    emissiveMap: emissiveMap ?? undefined,
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

function normalizeBoxRoot(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  const targetHeight = 0.55;
  if (size.y > 1e-4) {
    root.scale.multiplyScalar(targetHeight / size.y);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  root.name = 'harvestingBoxContent';
  return root;
}

function loadBoxTemplate(): Promise<THREE.Group> {
  if (boxTemplate) return Promise.resolve(boxTemplate);
  if (boxLoadPromise) return boxLoadPromise;

  boxLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(`${FBX_WEAPON_ASSET_BASE}game_modes/`);
    const fbx = await loader.loadAsync(`${FBX_WEAPON_ASSET_BASE}${BOX_FBX}`);
    let emissiveMap: THREE.Texture | null = null;
    try {
      emissiveMap = await loadEmissiveTexture(BOX_TEXTURE);
    } catch (error) {
      console.warn('[HarvestingBox] Texture failed', error);
    }
    applyBoxMaterials(fbx as THREE.Group, emissiveMap);
    boxTemplate = normalizeBoxRoot(fbx as THREE.Group);
    return boxTemplate;
  })().finally(() => {
    boxLoadPromise = null;
  });

  return boxLoadPromise;
}

export async function createHarvestingBoxMesh(): Promise<THREE.Group> {
  const template = await loadBoxTemplate();
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      child.material = (child.material as THREE.Material).clone();
    }
  });
  return clone;
}

export function preloadHarvestingBoxModel(): Promise<THREE.Group> {
  return loadBoxTemplate();
}
