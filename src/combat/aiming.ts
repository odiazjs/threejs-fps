import * as THREE from 'three';
import { raycastLevel } from '../../shared/level/collision';
import {
  MAX_AIM_DISTANCE,
  PROJECTILE_SPAWN_OFFSET,
} from './projectileConfig';

const AIM_RAY_MIN_DISTANCE = 0.35;
const BARREL_AXIS = new THREE.Vector3(1, 0, 0);

const _aimPoint = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _muzzleBack = new THREE.Vector3();

function getMuzzleObject(weapon: THREE.Object3D): THREE.Object3D {
  const cached = weapon.userData.weaponMuzzle as THREE.Object3D | undefined;
  return cached ?? weapon.getObjectByName('muzzle') ?? weapon;
}

export function readWeaponMuzzleWorldPosition(
  weapon: THREE.Object3D,
  position: THREE.Vector3,
): void {
  getMuzzleObject(weapon).getWorldPosition(position);
}

function readMuzzlePosition(weapon: THREE.Object3D, position: THREE.Vector3): void {
  readWeaponMuzzleWorldPosition(weapon, position);
}

/** World-space bore direction from the muzzle (includes sway / visual recoil). */
export function readMuzzleWorldAimDirection(
  weapon: THREE.Object3D,
  direction: THREE.Vector3,
): void {
  const muzzle = getMuzzleObject(weapon);
  muzzle.getWorldPosition(_muzzlePos);
  _muzzleBack.copy(BARREL_AXIS).multiplyScalar(-0.05).applyMatrix4(muzzle.matrixWorld);
  direction.subVectors(_muzzlePos, _muzzleBack).normalize();
}

function readMuzzleAimPoint(weapon: THREE.Object3D, target: THREE.Vector3): void {
  readMuzzlePosition(weapon, _muzzlePos);
  readMuzzleWorldAimDirection(weapon, _muzzleDir);

  const hit = raycastLevel(
    _muzzlePos.x,
    _muzzlePos.y,
    _muzzlePos.z,
    _muzzleDir.x,
    _muzzleDir.y,
    _muzzleDir.z,
    MAX_AIM_DISTANCE,
    AIM_RAY_MIN_DISTANCE,
  );

  if (hit) {
    target.set(hit.x, hit.y, hit.z);
    return;
  }

  target.copy(_muzzlePos).addScaledVector(_muzzleDir, MAX_AIM_DISTANCE);
}

/**
 * Fire from the muzzle along the bore (matches swayed crosshair placement).
 * Call after `weapon.updateMatrixWorld(true)`.
 */
export function readMuzzleFirePose(
  weapon: THREE.Object3D,
  _camera: THREE.Camera,
  position: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  readMuzzlePosition(weapon, _muzzlePos);
  readMuzzleWorldAimDirection(weapon, direction);
  position.copy(_muzzlePos);
  position.addScaledVector(direction, PROJECTILE_SPAWN_OFFSET);
}

export interface ScreenOffset2D {
  x: number;
  y: number;
}

/** Pixel offset from screen center for where the muzzle is pointing. */
export function projectMuzzleAimToScreenOffset(
  weapon: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
  target: ScreenOffset2D,
): void {
  weapon.updateMatrixWorld(true);
  readMuzzleAimPoint(weapon, _aimPoint);
  _aimPoint.project(camera);

  target.x = (_aimPoint.x * 0.5 + 0.5) * width - width * 0.5;
  target.y = (-_aimPoint.y * 0.5 + 0.5) * height - height * 0.5;
}
