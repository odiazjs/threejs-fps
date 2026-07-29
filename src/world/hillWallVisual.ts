import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { FBX_WEAPON_ASSET_BASE } from '../content/fbxWeaponMesh';
import { configureColorTexture, optimizeObjectTextures } from '../content/textureQuality';

const HILL_WALL_FBX = 'game_modes/hill_wall.fbx';
const HILL_WALL_TEXTURE = '/3d/game_modes/hill_wall_texture.png';

const textureLoader = new THREE.TextureLoader();

let template: THREE.Group | null = null;
let loadPromise: Promise<THREE.Group> | null = null;
/** Local AABB size of the normalized template (scale = 1). */
const templateLocalSize = new THREE.Vector3(1, 1, 1);

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

function applyMeshyMaterials(
  root: THREE.Object3D,
  emissiveMap: THREE.Texture | null,
): void {
  const material = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: emissiveMap ? 0xffffff : 0x88aa77,
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

/** Center at origin — world scale/rotation applied by the caller. */
function normalizeRoot(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  box.getSize(templateLocalSize);
  templateLocalSize.x = Math.max(templateLocalSize.x, 1e-4);
  templateLocalSize.y = Math.max(templateLocalSize.y, 1e-4);
  templateLocalSize.z = Math.max(templateLocalSize.z, 1e-4);

  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.sub(center);
  root.updateMatrixWorld(true);
  root.name = 'hillWallContent';
  return root;
}

function loadTemplate(): Promise<THREE.Group> {
  if (template) return Promise.resolve(template);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(`${FBX_WEAPON_ASSET_BASE}game_modes/`);
    const fbx = await loader.loadAsync(`${FBX_WEAPON_ASSET_BASE}${HILL_WALL_FBX}`);
    let emissiveMap: THREE.Texture | null = null;
    try {
      emissiveMap = await loadEmissiveTexture(HILL_WALL_TEXTURE);
    } catch (error) {
      console.warn('[HillWall] Texture failed', error);
    }
    applyMeshyMaterials(fbx as THREE.Group, emissiveMap);
    optimizeObjectTextures(fbx as THREE.Group);
    template = normalizeRoot(fbx as THREE.Group);
    return template;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

/**
 * Clone sized so its max axis matches `targetSize`'s max axis (uniform scale).
 */
export async function createHillWallMesh(
  targetSize: THREE.Vector3,
): Promise<THREE.Group> {
  const source = await loadTemplate();
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      child.material = (child.material as THREE.Material).clone();
    }
  });

  const targetMax = Math.max(targetSize.x, targetSize.y, targetSize.z, 0.5);
  const localMax = Math.max(
    templateLocalSize.x,
    templateLocalSize.y,
    templateLocalSize.z,
  );
  clone.scale.setScalar(targetMax / localMax);
  clone.updateMatrixWorld(true);
  return clone;
}
