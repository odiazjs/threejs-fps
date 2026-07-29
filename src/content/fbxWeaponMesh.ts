import * as THREE from 'three';
import { optimizeObjectTextures } from './textureQuality';

export const FBX_WEAPON_ASSET_BASE = '/3d/';

export interface FbxWeaponMeshConfig {
  meshLength: number;
  modelYaw: number;
  contentName: string;
  rootName: string;
  /**
   * When true, wire `weaponSightMount` from the authored FBX `sight_mount` empty.
   * Never synthesizes a socket — if the empty is missing, no mount is bound.
   */
  sightMount?: boolean;
}

export function fbxWeaponAssetUrl(file: string): string {
  return `${FBX_WEAPON_ASSET_BASE}${file
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

export function prepareFbxWeaponMesh(model: THREE.Group, config: FbxWeaponMeshConfig): THREE.Group {
  optimizeObjectTextures(model);
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

  const ventInset = 0.12;
  const ventLateral = Math.max(boundsSize.x, boundsSize.z) * 0.42;
  const ventY = muzzleY;
  let ventLeftX: number;
  let ventRightX: number;
  let ventLeftZ: number;
  let ventRightZ: number;
  if (barrelAlongZ) {
    const ventZ = muzzleZ - boundsSize.z * ventInset;
    ventLeftX = (bounds.min.x + bounds.max.x) * 0.5 - ventLateral;
    ventRightX = (bounds.min.x + bounds.max.x) * 0.5 + ventLateral;
    ventLeftZ = ventZ;
    ventRightZ = ventZ;
  } else {
    const ventX = muzzleX - boundsSize.x * ventInset;
    ventLeftZ = (bounds.min.z + bounds.max.z) * 0.5 - ventLateral;
    ventRightZ = (bounds.min.z + bounds.max.z) * 0.5 + ventLateral;
    ventLeftX = ventX;
    ventRightX = ventX;
  }

  const ventLeft = new THREE.Object3D();
  ventLeft.name = 'muzzle_vent_l';
  ventLeft.position.copy(
    content.worldToLocal(new THREE.Vector3(ventLeftX, ventY, ventLeftZ)),
  );
  content.add(ventLeft);

  const ventRight = new THREE.Object3D();
  ventRight.name = 'muzzle_vent_r';
  ventRight.position.copy(
    content.worldToLocal(new THREE.Vector3(ventRightX, ventY, ventRightZ)),
  );
  content.add(ventRight);

  const root = new THREE.Group();
  root.name = config.rootName;
  root.add(content);
  root.userData.weaponMuzzle = muzzle;
  root.userData.weaponSideVents = [ventLeft, ventRight];

  // Authored `sight_mount` only — never invent a rail position.
  const authored =
    findNamedObject(content, 'sight_mount') ?? findNamedObject(model, 'sight_mount');
  if (authored) {
    root.userData.weaponSightMount = bindSightMountToContent(content, authored);
  } else if (config.sightMount) {
    console.warn(
      `[fbxWeaponMesh] ${config.rootName}: sightMount requested but no authored sight_mount in FBX`,
    );
  }

  return root;
}

function findNamedObject(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const exact = root.getObjectByName(name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (found || !child.name) return;
    if (child.name.toLowerCase() === lower) found = child;
  });
  return found;
}

/**
 * Authored sockets are often children of Meshy meshes (scale ~100).
 * Reparent onto fitted content so attachments don't inherit ×100 scale.
 * World-space center position of the empty is preserved exactly — no guessed offsets.
 */
function bindSightMountToContent(
  content: THREE.Object3D,
  mount: THREE.Object3D,
): THREE.Object3D {
  content.updateMatrixWorld(true);
  mount.updateMatrixWorld(true);

  const worldPos = new THREE.Vector3();
  mount.getWorldPosition(worldPos);

  content.add(mount);
  mount.position.copy(content.worldToLocal(worldPos.clone()));
  // Position marker only — drop inherited mesh tilt/scale so the empty's
  // center is the sole placement authority for optics.
  mount.quaternion.identity();
  mount.scale.set(1, 1, 1);
  mount.name = 'sight_mount';
  return mount;
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

  const ventLeft = clone.getObjectByName('muzzle_vent_l');
  const ventRight = clone.getObjectByName('muzzle_vent_r');
  if (ventLeft && ventRight) {
    clone.userData.weaponSideVents = [ventLeft, ventRight];
  }

  const sightMount = clone.getObjectByName('sight_mount');
  if (sightMount) {
    clone.userData.weaponSightMount = sightMount;
  }

  const digitalSight = clone.getObjectByName('digital_sight');
  if (digitalSight) {
    clone.userData.weaponDigitalSight = digitalSight;
  }

  return clone;
}
