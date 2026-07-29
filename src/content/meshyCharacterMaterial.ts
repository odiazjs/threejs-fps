import * as THREE from 'three';
import {
  getCharacterSkinTextureUrl,
  SHARED_CHARACTER_MESH_FILE,
} from '../../shared/content/characterMesh';
import { DEFAULT_CHARACTER_ITEM_ID } from '../../shared/content/storeItemTypes';
import { configureColorTexture } from './textureQuality';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const textureLoads = new Map<string, Promise<THREE.Texture>>();

function loadEmissiveTexture(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);

  const pending = textureLoads.get(url);
  if (pending) return pending;

  const load = new Promise<THREE.Texture>((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        configureColorTexture(texture);
        textureCache.set(url, texture);
        textureLoads.delete(url);
        resolve(texture);
      },
      undefined,
      (err) => {
        textureLoads.delete(url);
        reject(err);
      },
    );
  });

  textureLoads.set(url, load);
  return load;
}

/** True when this mesh should use the shared Meshy emissive material. */
export function isSharedCharacterMesh(meshFile: string): boolean {
  return meshFile === SHARED_CHARACTER_MESH_FILE;
}

/**
 * Apply Meshy self-lit shading for a store skin: black color/specular,
 * emissiveIntensity 1, skin texture on emissiveMap.
 */
export async function applyMeshyCharacterMaterial(
  root: THREE.Object3D,
  skinId: string = DEFAULT_CHARACTER_ITEM_ID,
): Promise<void> {
  const emissiveMap = await loadEmissiveTexture(getCharacterSkinTextureUrl(skinId));
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
    // Skip attached face heads — they keep their own materials.
    let ancestor: THREE.Object3D | null = child;
    while (ancestor) {
      if (ancestor.name === 'characterFaceAttach') return;
      ancestor = ancestor.parent;
    }
    if (Array.isArray(child.material)) {
      for (const old of child.material) old.dispose();
    } else {
      child.material.dispose();
    }
    child.material = material;
  });
}
