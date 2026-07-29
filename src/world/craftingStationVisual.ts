import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { FBX_WEAPON_ASSET_BASE } from '../content/fbxWeaponMesh';
import { configureColorTexture } from '../content/textureQuality';
import { CRAFTING_STATION_HEIGHT } from '../../shared/level/craftingStationSpawns';

const STATION_FBX = 'game_modes/crafting_station.fbx';
const STATION_TEXTURE = '/3d/game_modes/crafting_station_texture.png';

const textureLoader = new THREE.TextureLoader();

let stationTemplate: THREE.Group | null = null;
let stationLoadPromise: Promise<THREE.Group> | null = null;
let stationHalfExtents = {
  halfX: 0.95,
  halfY: CRAFTING_STATION_HEIGHT * 0.5,
  halfZ: 0.95,
};

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

function applyStationMaterials(
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

function normalizeStationRoot(root: THREE.Group): THREE.Group {
  // Scale first, then fit feet to local origin (offset-before-scale → sky).
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.y > 1e-4) {
    root.scale.multiplyScalar(CRAFTING_STATION_HEIGHT / size.y);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(root);
  box.getSize(size);
  stationHalfExtents = {
    halfX: Math.max(0.2, size.x * 0.5),
    halfY: Math.max(0.2, size.y * 0.5),
    halfZ: Math.max(0.2, size.z * 0.5),
  };

  root.name = 'craftingStationContent';
  return root;
}

function loadStationTemplate(): Promise<THREE.Group> {
  if (stationTemplate) return Promise.resolve(stationTemplate);
  if (stationLoadPromise) return stationLoadPromise;

  stationLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(`${FBX_WEAPON_ASSET_BASE}game_modes/`);
    const fbx = await loader.loadAsync(`${FBX_WEAPON_ASSET_BASE}${STATION_FBX}`);
    let emissiveMap: THREE.Texture | null = null;
    try {
      emissiveMap = await loadEmissiveTexture(STATION_TEXTURE);
    } catch (error) {
      console.warn('[CraftingStation] Emissive texture failed — using solid emissive', error);
    }
    applyStationMaterials(fbx as THREE.Group, emissiveMap);
    stationTemplate = normalizeStationRoot(fbx as THREE.Group);
    return stationTemplate;
  })().finally(() => {
    stationLoadPromise = null;
  });

  return stationLoadPromise;
}

export function getCraftingStationHalfExtents(): {
  halfX: number;
  halfY: number;
  halfZ: number;
} {
  return { ...stationHalfExtents };
}

export function preloadCraftingStationModel(): Promise<THREE.Group> {
  return loadStationTemplate();
}

export async function createCraftingStationMesh(): Promise<THREE.Group> {
  const template = await loadStationTemplate();
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      child.material = (child.material as THREE.Material).clone();
    }
  });
  return clone;
}
