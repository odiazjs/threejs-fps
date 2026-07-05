import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  AMMO_BOX_SCALE,
  AMMO_BOX_VISUAL_LOD,
  AMMO_BOX_VISUAL_MODEL,
} from '../../shared/level/ammoBoxConfig.js';
import { keepSingleFbxLodMesh } from '../../shared/visuals/fbxLodUtils.js';

const ASSET_BASE = '/3d/';

let templatePromise: Promise<THREE.Group> | null = null;

function prepareAmmoBoxModel(model: THREE.Group): THREE.Group {
  keepSingleFbxLodMesh(model, AMMO_BOX_VISUAL_LOD);
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.name = 'ammoBox';
  wrapper.add(model);
  wrapper.scale.setScalar(AMMO_BOX_SCALE);
  return wrapper;
}

export function loadAmmoBoxTemplate(): Promise<THREE.Group> {
  if (!templatePromise) {
    templatePromise = (async () => {
      const loader = new FBXLoader();
      loader.setResourcePath(ASSET_BASE);
      const fbx = await loader.loadAsync(`${ASSET_BASE}${encodeURIComponent(AMMO_BOX_VISUAL_MODEL)}`);
      return prepareAmmoBoxModel(fbx as THREE.Group);
    })();
  }
  return templatePromise;
}
