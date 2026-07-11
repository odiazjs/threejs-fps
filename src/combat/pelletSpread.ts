import * as THREE from 'three';

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Build a unit direction for one shotgun pellet.
 * Pellet 0 stays on the aim ray; remaining pellets sit on a ring at `spreadRad`.
 */
export function readPelletDirection(
  aimDir: THREE.Vector3,
  pelletIndex: number,
  pelletCount: number,
  spreadRad: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  _forward.copy(aimDir);
  if (_forward.lengthSq() < 1e-8) {
    out.set(0, 0, -1);
    return out;
  }
  _forward.normalize();

  if (pelletCount <= 1 || spreadRad <= 0 || pelletIndex <= 0) {
    return out.copy(_forward);
  }

  _right.crossVectors(_forward, _worldUp);
  if (_right.lengthSq() < 1e-8) {
    _right.set(1, 0, 0);
  } else {
    _right.normalize();
  }
  _up.crossVectors(_right, _forward).normalize();

  const ringCount = Math.max(1, pelletCount - 1);
  const ringIndex = pelletIndex - 1;
  const yaw = (ringIndex / ringCount) * Math.PI * 2;
  const sinPitch = Math.sin(spreadRad);
  const cosPitch = Math.cos(spreadRad);

  out
    .copy(_forward)
    .multiplyScalar(cosPitch)
    .addScaledVector(_right, Math.cos(yaw) * sinPitch)
    .addScaledVector(_up, Math.sin(yaw) * sinPitch);

  return out.normalize();
}
