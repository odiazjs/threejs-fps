import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const ASSET_BASE = '/3d/';
const DRONE_MODEL_FILE = 'dron.fbx';
/** World-space max axis after fit — matches previous procedural drone footprint. */
const DRONE_TARGET_SIZE = 0.9 * 1.5;

let droneTemplate: THREE.Group | null = null;
let droneLoadPromise: Promise<THREE.Group> | null = null;

function prepareDroneModel(fbx: THREE.Group): THREE.Group {
  fbx.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  fbx.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(fbx);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = DRONE_TARGET_SIZE / maxDim;

  const content = new THREE.Group();
  content.name = 'droneContent';
  content.add(fbx);
  content.scale.setScalar(scale);
  content.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(content);
  const center = fitted.getCenter(new THREE.Vector3());
  content.position.set(-center.x, -fitted.min.y, -center.z);

  const root = new THREE.Group();
  root.name = 'droneRoot';
  root.add(content);
  return root;
}

function loadDroneTemplate(): Promise<THREE.Group> {
  if (droneTemplate) return Promise.resolve(droneTemplate);
  if (droneLoadPromise) return droneLoadPromise;

  droneLoadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(ASSET_BASE);
    const fbx = await loader.loadAsync(
      `${ASSET_BASE}${encodeURIComponent(DRONE_MODEL_FILE)}`,
    );
    droneTemplate = prepareDroneModel(fbx as THREE.Group);
    return droneTemplate;
  })().finally(() => {
    droneLoadPromise = null;
  });

  return droneLoadPromise;
}

export function preloadDroneModel(): Promise<THREE.Group> {
  return loadDroneTemplate();
}

/** Clone a fitted drone mesh. Call `preloadDroneModel()` first. */
export function createDroneMesh(): THREE.Group {
  if (!droneTemplate) {
    throw new Error('Drone model not preloaded — call preloadDroneModel() first');
  }
  return cloneSkeleton(droneTemplate) as THREE.Group;
}
