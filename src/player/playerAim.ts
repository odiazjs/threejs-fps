import * as THREE from 'three';

/** Must match pointer-aim euler order. */
export const AIM_ROTATION_ORDER = 'YXZ' as const;

/** Vertical look limit — just under ±90° to avoid gimbal flip. */
export const AIM_PITCH_LIMIT = Math.PI / 2 - 0.01;

const _euler = new THREE.Euler(0, 0, 0, AIM_ROTATION_ORDER);
const _quat = new THREE.Quaternion();

export interface PlayerAim {
  yaw: number;
  pitch: number;
}

export function readPlayerAim(object: THREE.Object3D): PlayerAim {
  _euler.setFromQuaternion(object.quaternion, AIM_ROTATION_ORDER);
  return { yaw: _euler.y, pitch: _euler.x };
}

/** World-space look yaw/pitch — includes aim and recoil parent rigs. */
export function readWorldPlayerAim(object: THREE.Object3D): PlayerAim {
  object.getWorldQuaternion(_quat);
  _euler.setFromQuaternion(_quat, AIM_ROTATION_ORDER);
  return { yaw: _euler.y, pitch: _euler.x };
}

export function applyPlayerAim(object: THREE.Object3D, yaw: number, pitch: number): void {
  object.rotation.order = AIM_ROTATION_ORDER;
  object.rotation.set(pitch, yaw, 0);
}

export function applyLookYaw(object: THREE.Object3D, yaw: number): void {
  object.rotation.order = AIM_ROTATION_ORDER;
  object.rotation.set(0, yaw, 0);
}

export function applyLookPitch(object: THREE.Object3D, pitch: number): void {
  object.rotation.order = AIM_ROTATION_ORDER;
  object.rotation.set(
    THREE.MathUtils.clamp(pitch, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT),
    0,
    0,
  );
}
