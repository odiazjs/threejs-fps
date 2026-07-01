import * as THREE from 'three';
import { CHARACTER_MODEL_FILES } from './characterModel';
import type { WeaponId } from '../../shared/content/weaponIds';
import { MELEE_WEAPON_ID } from '../../shared/content/weaponIds';

export interface RemoteWeaponMount {
  readonly handPosition: THREE.Vector3;
  readonly handRotation: THREE.Euler;
  readonly weaponPosition: THREE.Vector3;
  readonly weaponRotation: THREE.Euler;
}

/** Rifle Aiming Idle — right hand on grip, barrel forward. */
const RIFLE_AIMING_RIFLE_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(5, 25, 7),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Pistol Idle — one-hand pistol pose. */
const PISTOL_IDLE_PISTOL_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(2, 16, 6),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Running Shoot Rifle — sprint pose. */
const RIFLE_RUN_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(5, 25, 7),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Pistol Run — sprint pose. */
const PISTOL_RUN_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(2, 16, 6),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Rifle Walking — walk pose. */
const RIFLE_WALK_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(5, 25, 7),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Pistol Walk — walk pose. */
const PISTOL_WALK_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(2, 16, 6),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Standing Idle Melee — katana held upright at rest. */
const MELEE_IDLE_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(4, 22, 5),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

/** Standing Melee Attack Horizontal — slash pose. */
const MELEE_ATTACK_MOUNT: RemoteWeaponMount = {
  handPosition: new THREE.Vector3(0, 0, 0),
  handRotation: new THREE.Euler(0, 0, 0),
  weaponPosition: new THREE.Vector3(6, 20, 8),
  weaponRotation: new THREE.Euler(0, 180, 89.5),
};

const DEFAULT_MOUNT = RIFLE_AIMING_RIFLE_MOUNT;

export function getRemoteWeaponMount(modelFile: string, weaponId: WeaponId): RemoteWeaponMount {
  if (weaponId === MELEE_WEAPON_ID) {
    if (modelFile === CHARACTER_MODEL_FILES.meleeAttack) return MELEE_ATTACK_MOUNT;
    return MELEE_IDLE_MOUNT;
  }

  if (weaponId === 'pistol') {
    if (modelFile === CHARACTER_MODEL_FILES.pistolRun) return PISTOL_RUN_MOUNT;
    if (modelFile === CHARACTER_MODEL_FILES.pistolWalk) return PISTOL_WALK_MOUNT;
    return PISTOL_IDLE_PISTOL_MOUNT;
  }

  if (modelFile === CHARACTER_MODEL_FILES.lobby) return RIFLE_AIMING_RIFLE_MOUNT;
  if (modelFile === CHARACTER_MODEL_FILES.rifleRunShoot) return RIFLE_RUN_MOUNT;
  if (modelFile === CHARACTER_MODEL_FILES.rifleWalking) return RIFLE_WALK_MOUNT;
  if (modelFile === CHARACTER_MODEL_FILES.reloadSprint) return RIFLE_RUN_MOUNT;
  if (modelFile === CHARACTER_MODEL_FILES.reloadWalk) return RIFLE_WALK_MOUNT;
  if (modelFile === CHARACTER_MODEL_FILES.reloadIdle) return RIFLE_AIMING_RIFLE_MOUNT;
  return RIFLE_AIMING_RIFLE_MOUNT;
}
