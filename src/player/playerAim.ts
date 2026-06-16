import * as THREE from 'three';

/** Must match PointerLockControls internal euler order. */
export const AIM_ROTATION_ORDER = 'YXZ' as const;

const _euler = new THREE.Euler(0, 0, 0, AIM_ROTATION_ORDER);

export interface PlayerAim {
  yaw: number;
  pitch: number;
}

export function readPlayerAim(object: THREE.Object3D): PlayerAim {
  _euler.setFromQuaternion(object.quaternion, AIM_ROTATION_ORDER);
  return { yaw: _euler.y, pitch: _euler.x };
}

export function applyPlayerAim(object: THREE.Object3D, yaw: number, pitch: number): void {
  object.rotation.order = AIM_ROTATION_ORDER;
  object.rotation.set(pitch, yaw, 0);
}
