import * as THREE from 'three';
import { createGltfLoader } from '../content/gltfLoader';
import { configureColorTexture, optimizeObjectTextures } from '../content/textureQuality';
import { CRAFTING_STATION_HEIGHT } from '../../shared/level/craftingStationSpawns';

const ASSET_BASE = '/3d/';
const STATION_GLB = 'game_modes/crafting_station_2.glb';

let stationTemplate: THREE.Group | null = null;
let stationLoadPromise: Promise<THREE.Group> | null = null;
let stationHalfExtents = {
  halfX: 0.95,
  halfY: CRAFTING_STATION_HEIGHT * 0.5,
  halfZ: 0.95,
};

function pickAlbedoMap(material: THREE.Material): THREE.Texture | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
  ) {
    return material.map ?? material.emissiveMap ?? null;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map ?? null;
  }
  return null;
}

function applyStationMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      const map = pickAlbedoMap(source);
      if (map) configureColorTexture(map);
      const flat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: map ?? undefined,
        transparent: source.transparent,
        opacity: source.opacity,
        side: source.side,
      });
      source.dispose();
      return flat;
    });
    child.material = next.length === 1 ? next[0]! : next;
    child.castShadow = false;
    child.receiveShadow = true;
  });
}

function normalizeStationRoot(root: THREE.Group): THREE.Group {
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
    const loader = createGltfLoader();
    loader.setResourcePath(ASSET_BASE);
    const stationUrl = `${ASSET_BASE}${STATION_GLB.split('/').map(encodeURIComponent).join('/')}`;
    const gltf = await loader.loadAsync(stationUrl);
    const root = gltf.scene as THREE.Group;
    applyStationMaterials(root);
    optimizeObjectTextures(root);
    stationTemplate = normalizeStationRoot(root);
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
