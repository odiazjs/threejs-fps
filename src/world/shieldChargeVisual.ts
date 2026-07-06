import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  SHIELD_CHARGE_TARGET_HEIGHT,
  SHIELD_CHARGE_VISUAL_LOD,
  SHIELD_CHARGE_VISUAL_MODEL,
} from '../../shared/level/shieldChargeConfig';
import { keepSingleFbxLodMesh } from '../../shared/visuals/fbxLodUtils';

const ASSET_BASE = '/3d/';

let templatePromise: Promise<THREE.Group> | null = null;

function prepareShieldChargeModel(model: THREE.Group): THREE.Group {
  keepSingleFbxLodMesh(model, SHIELD_CHARGE_VISUAL_LOD);
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
  const scale = SHIELD_CHARGE_TARGET_HEIGHT / maxDim;

  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.name = 'shieldChargePickup';
  wrapper.add(model);
  wrapper.scale.setScalar(scale);
  return wrapper;
}

export function loadShieldChargeTemplate(): Promise<THREE.Group> {
  if (!templatePromise) {
    templatePromise = (async () => {
      const loader = new FBXLoader();
      loader.setResourcePath(ASSET_BASE);
      const fbx = await loader.loadAsync(
        `${ASSET_BASE}${encodeURIComponent(SHIELD_CHARGE_VISUAL_MODEL)}`,
      );
      return prepareShieldChargeModel(fbx as THREE.Group);
    })();
  }
  return templatePromise;
}
