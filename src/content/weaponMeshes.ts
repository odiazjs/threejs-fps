import type * as THREE from 'three';
import type { WeaponId } from '../../shared/content/weaponIds';
import { createPistolWeaponMesh, preloadPistolWeaponModel } from './pistolModel';
import { createRifleWeaponMesh, preloadRifleWeaponModel } from './rifleModel';
import { createKatanaWeaponMesh, preloadKatanaWeaponModel } from './katanaModel';
import { createSniperWeaponMesh, preloadSniperWeaponModel } from './sniperModel';
import {
  createRootBioCarbineWeaponMesh,
  preloadRootBioCarbineWeaponModel,
} from './rootBioCarbineModel';
import {
  createBioLiquidRifleWeaponMesh,
  preloadBioLiquidRifleWeaponModel,
} from './bioLiquidRifleModel';
import {
  createPlasmaShotgunWeaponMesh,
  preloadPlasmaShotgunWeaponModel,
} from './plasmaShotgunModel';

export function preloadWeaponMeshes(): Promise<void> {
  return Promise.all([
    preloadPistolWeaponModel(),
    preloadRifleWeaponModel(),
    preloadSniperWeaponModel(),
    preloadRootBioCarbineWeaponModel(),
    preloadBioLiquidRifleWeaponModel(),
    preloadPlasmaShotgunWeaponModel(),
    preloadKatanaWeaponModel(),
  ]).then(() => undefined);
}

export function createWeaponMesh(id: WeaponId): THREE.Group {
  switch (id) {
    case 'pistol':
      return createPistolWeaponMesh();
    case 'sniper_rifle':
      return createSniperWeaponMesh();
    case 'katana':
      return createKatanaWeaponMesh();
    case 'root_bio_carbine':
      return createRootBioCarbineWeaponMesh();
    case 'bio_liquid_rifle':
      return createBioLiquidRifleWeaponMesh();
    case 'plasma_shotgun':
      return createPlasmaShotgunWeaponMesh();
    case 'plasma_rifle':
    default:
      return createRifleWeaponMesh();
  }
}
