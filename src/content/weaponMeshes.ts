import type * as THREE from 'three';
import { isPickableWeaponId, type WeaponId } from '../../shared/content/weaponIds';
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
import {
  createBioMachineGunWeaponMesh,
  preloadBioMachineGunWeaponModel,
} from './bioMachineGunModel';
import { createBioSmg1WeaponMesh, preloadBioSmg1WeaponModel } from './bioSmg1Model';
import {
  mountDigitalSightSocketOnWeapon,
  preloadDigitalSightTextures,
} from './digitalWeaponSights';

/** FBX content group name per gun — used to place the digital sight on the weapon root. */
const DIGITAL_SIGHT_CONTENT_NAME: Partial<Record<WeaponId, string>> = {
  pistol: 'pistolContent',
  plasma_rifle: 'rifleContent',
  sniper_rifle: 'sniperContent',
  root_bio_carbine: 'rootBioCarbineContent',
  bio_liquid_rifle: 'bioLiquidRifleContent',
  bio_machine_gun: 'bioMachineGunContent',
  bio_smg_1: 'bioSmg1Content',
  plasma_shotgun: 'plasmaShotgunContent',
};

function withEquippableDigitalSight(weaponId: WeaponId, mesh: THREE.Group): THREE.Group {
  if (!isPickableWeaponId(weaponId)) return mesh;
  const contentName = DIGITAL_SIGHT_CONTENT_NAME[weaponId];
  if (!contentName) return mesh;
  mountDigitalSightSocketOnWeapon(mesh, contentName);
  return mesh;
}

export function preloadWeaponMeshes(): Promise<void> {
  return Promise.all([
    preloadPistolWeaponModel(),
    preloadRifleWeaponModel(),
    preloadSniperWeaponModel(),
    preloadRootBioCarbineWeaponModel(),
    preloadBioLiquidRifleWeaponModel(),
    preloadBioMachineGunWeaponModel(),
    preloadBioSmg1WeaponModel(),
    preloadPlasmaShotgunWeaponModel(),
    preloadKatanaWeaponModel(),
    preloadDigitalSightTextures(),
  ]).then(() => undefined);
}

export function createWeaponMesh(id: WeaponId): THREE.Group {
  let mesh: THREE.Group;
  switch (id) {
    case 'pistol':
      mesh = createPistolWeaponMesh();
      break;
    case 'sniper_rifle':
      mesh = createSniperWeaponMesh();
      break;
    case 'katana':
      mesh = createKatanaWeaponMesh();
      break;
    case 'root_bio_carbine':
      mesh = createRootBioCarbineWeaponMesh();
      break;
    case 'bio_liquid_rifle':
      mesh = createBioLiquidRifleWeaponMesh();
      break;
    case 'bio_machine_gun':
      mesh = createBioMachineGunWeaponMesh();
      break;
    case 'bio_smg_1':
      mesh = createBioSmg1WeaponMesh();
      break;
    case 'plasma_shotgun':
      mesh = createPlasmaShotgunWeaponMesh();
      break;
    case 'plasma_rifle':
    default:
      mesh = createRifleWeaponMesh();
      break;
  }
  return withEquippableDigitalSight(id, mesh);
}
