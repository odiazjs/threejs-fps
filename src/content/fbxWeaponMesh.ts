import * as THREE from 'three';

export const FBX_WEAPON_ASSET_BASE = '/3d/';

export interface FbxWeaponMeshConfig {
  meshLength: number;
  modelYaw: number;
  contentName: string;
  rootName: string;
}

export function fbxWeaponAssetUrl(file: string): string {
  return `${FBX_WEAPON_ASSET_BASE}${encodeURIComponent(file)}`;
}

export function prepareFbxWeaponMesh(model: THREE.Group, config: FbxWeaponMeshConfig): THREE.Group {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const content = new THREE.Group();
  content.name = config.contentName;
  content.add(model);
  model.rotation.set(0, config.modelYaw + Math.PI, 0);
  content.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const barrelExtent = Math.max(size.x, size.z, 0.001);
  // Fit scale on an inner group — WeaponLoadout replaces the root scale with 0.1.
  content.scale.setScalar(config.meshLength / barrelExtent);
  content.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(content);
  const center = fitted.getCenter(new THREE.Vector3());
  content.position.set(-center.x, -fitted.min.y, -center.z);
  content.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(content);
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const barrelAlongZ = boundsSize.z > boundsSize.x;
  const muzzleY = (bounds.min.y + bounds.max.y) * 0.5;
  const muzzleX = barrelAlongZ ? (bounds.min.x + bounds.max.x) * 0.5 : bounds.max.x;
  const muzzleZ = barrelAlongZ ? bounds.max.z : (bounds.min.z + bounds.max.z) * 0.5;

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.copy(content.worldToLocal(new THREE.Vector3(muzzleX, muzzleY, muzzleZ)));
  content.add(muzzle);

  const root = new THREE.Group();
  root.name = config.rootName;
  root.add(content);
  root.userData.weaponMuzzle = muzzle;

  return root;
}

export function cloneFbxWeaponMesh(root: THREE.Group): THREE.Group {
  const clone = root.clone(true);
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else {
      child.material = child.material.clone();
    }
  });

  const muzzle = clone.getObjectByName('muzzle');
  if (muzzle) {
    clone.userData.weaponMuzzle = muzzle;
  }

  return clone;
}
