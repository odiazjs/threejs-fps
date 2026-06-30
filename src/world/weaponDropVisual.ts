import * as THREE from 'three';
import { isWeaponId, type WeaponId } from '../../shared/content/weaponIds';
import { createWeaponMesh } from '../content/weaponMeshes';

const GROUND_WEAPON_SCALE = 0.38;

export function createWeaponDropMesh(weaponId: string): THREE.Group {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'pistol';
  const wrapper = new THREE.Group();
  const mesh = createWeaponMesh(id);
  mesh.scale.setScalar(GROUND_WEAPON_SCALE);
  mesh.rotation.set(-Math.PI / 2, 0, 0);
  mesh.position.y = 0.1;
  mesh.traverse((child) => {
    child.frustumCulled = false;
  });
  wrapper.add(mesh);
  return wrapper;
}
