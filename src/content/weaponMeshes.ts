import type * as THREE from 'three';
import type { WeaponId } from '../../shared/content/weaponIds';
import { createPistolWeaponMesh, preloadPistolWeaponModel } from './pistolModel';
import { createRifleWeaponMesh, preloadRifleWeaponModel } from './rifleModel';

export function preloadWeaponMeshes(): Promise<void> {
  return Promise.all([preloadPistolWeaponModel(), preloadRifleWeaponModel()]).then(() => undefined);
}

export function createWeaponMesh(id: WeaponId): THREE.Group {
  switch (id) {
    case 'pistol':
      return createPistolWeaponMesh();
    case 'plasma_rifle':
      return createRifleWeaponMesh();
    default:
      return createRifleWeaponMesh();
  }
}
