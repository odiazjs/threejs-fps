import type * as THREE from 'three';
import type { WeaponId } from '../../shared/content/weaponIds';
import { createPistolWeaponMesh, preloadPistolWeaponModel } from './pistolModel';
import { createRifleWeaponMesh, preloadRifleWeaponModel } from './rifleModel';
import { createSniperWeaponMesh, preloadSniperWeaponModel } from './sniperModel';

export function preloadWeaponMeshes(): Promise<void> {
  return Promise.all([
    preloadPistolWeaponModel(),
    preloadRifleWeaponModel(),
    preloadSniperWeaponModel(),
  ]).then(() => undefined);
}

export function createWeaponMesh(id: WeaponId): THREE.Group {
  switch (id) {
    case 'pistol':
      return createPistolWeaponMesh();
    case 'sniper_rifle':
      return createSniperWeaponMesh();
    case 'plasma_rifle':
    default:
      return createRifleWeaponMesh();
  }
}
