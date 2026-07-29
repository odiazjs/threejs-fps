import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GRENADE_PICKUP_GRANT } from '../../shared/throwables/grenadeConfig';
import {
  GRENADE_TARGET_SIZE,
  GRENADE_VISUAL_LOD,
  GRENADE_VISUAL_MODEL,
} from '../../shared/throwables/grenadeModelConfig';
import { keepSingleFbxLodMesh } from '../../shared/visuals/fbxLodUtils';
import { optimizeObjectTextures } from './textureQuality';

const ASSET_BASE = '/3d/';

let templatePromise: Promise<THREE.Group> | null = null;
const pickupStackPromises = new Map<number, Promise<THREE.Group>>();

function prepareGrenadeModel(model: THREE.Group): THREE.Group {
  keepSingleFbxLodMesh(model, GRENADE_VISUAL_LOD);
  optimizeObjectTextures(model);
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const scale = GRENADE_TARGET_SIZE / maxDim;

  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.name = 'grenade';
  wrapper.add(model);
  wrapper.scale.setScalar(scale);
  return wrapper;
}

export function loadGrenadeTemplate(): Promise<THREE.Group> {
  if (!templatePromise) {
    templatePromise = (async () => {
      const loader = new FBXLoader();
      loader.setResourcePath(ASSET_BASE);
      const fbx = await loader.loadAsync(
        `${ASSET_BASE}${encodeURIComponent(GRENADE_VISUAL_MODEL)}`,
      );
      return prepareGrenadeModel(fbx as THREE.Group);
    })();
  }
  return templatePromise;
}

export function preloadGrenadeModel(): Promise<THREE.Group> {
  return loadGrenadeTemplate();
}

export async function createGrenadeMesh(): Promise<THREE.Group> {
  const template = await loadGrenadeTemplate();
  return template.clone(true);
}

export function loadGrenadePickupStackTemplate(
  grant = GRENADE_PICKUP_GRANT,
): Promise<THREE.Group> {
  const count = Math.min(Math.max(1, grant), 4);
  const cached = pickupStackPromises.get(count);
  if (cached) return cached;

  const promise = (async () => {
    const grenade = await loadGrenadeTemplate();
    const stack = new THREE.Group();
    stack.name = 'grenade-pickup-stack';

    const restY = GRENADE_TARGET_SIZE * 0.5;
    for (let i = 0; i < count; i++) {
      const copy = grenade.clone(true);
      copy.position.set((i % 2) * 0.12 - 0.06, restY + Math.floor(i / 2) * 0.1, 0);
      stack.add(copy);
    }

    return stack;
  })();

  pickupStackPromises.set(count, promise);
  return promise;
}

export function disposeGrenadeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) {
      for (const mat of material) mat.dispose();
    } else {
      material.dispose();
    }
  });
}
