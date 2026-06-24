import * as THREE from 'three';
import { raycastLevel } from '../../shared/level/collision';
import {
  MAX_AIM_DISTANCE,
  PROJECTILE_SPAWN_MARGIN,
  PROJECTILE_SPAWN_OFFSET,
} from './projectileConfig';

const AIM_RAY_MIN_DISTANCE = 0.35;

const _cameraOrigin = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleToAim = new THREE.Vector3();

function readMuzzlePosition(weapon: THREE.Object3D, position: THREE.Vector3): void {
  const muzzle = weapon.getObjectByName('muzzle');
  if (muzzle) {
    muzzle.getWorldPosition(position);
  } else {
    weapon.getWorldPosition(position);
  }
}

/**
 * Crosshair raycast from the camera, then aim from the muzzle toward the hit.
 * Call after `root.updateMatrixWorld(true)` so the muzzle pose is current.
 */
export function readMuzzleFirePose(
  weapon: THREE.Object3D,
  camera: THREE.Camera,
  position: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  readMuzzlePosition(weapon, _muzzlePos);

  camera.getWorldPosition(_cameraOrigin);
  camera.getWorldDirection(_cameraDirection);

  const hit = raycastLevel(
    _cameraOrigin.x,
    _cameraOrigin.y,
    _cameraOrigin.z,
    _cameraDirection.x,
    _cameraDirection.y,
    _cameraDirection.z,
    MAX_AIM_DISTANCE,
    AIM_RAY_MIN_DISTANCE,
  );

  if (hit) {
    _aimPoint.set(hit.x, hit.y, hit.z);
  } else {
    _aimPoint.copy(_cameraOrigin).addScaledVector(_cameraDirection, MAX_AIM_DISTANCE);
  }

  _muzzleToAim.subVectors(_aimPoint, _muzzlePos);
  const distToAim = _muzzleToAim.length();

  if (distToAim < 1e-6 || _muzzleToAim.dot(_cameraDirection) <= 0) {
    direction.copy(_cameraDirection);
  } else {
    direction.copy(_muzzleToAim).divideScalar(distToAim);
  }

  const maxOffset = Math.max(0, distToAim - PROJECTILE_SPAWN_MARGIN);
  const offset = Math.min(PROJECTILE_SPAWN_OFFSET, maxOffset);

  position.copy(_muzzlePos);
  if (offset > 0) {
    position.addScaledVector(direction, offset);
  }
}
