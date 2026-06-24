import * as THREE from 'three';
import type { WeaponId } from '../../shared/content/weaponIds';
import { createPistol, createPlasmaRifle } from './weapon';

export function createWeaponMesh(id: WeaponId): THREE.Group {
  switch (id) {
    case 'pistol':
      return createPistol();
    case 'plasma_rifle':
    default:
      return createPlasmaRifle();
  }
}
