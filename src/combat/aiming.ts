import * as THREE from 'three';
import {
  MAX_AIM_DISTANCE,
  PROJECTILE_SPAWN_OFFSET,
} from './projectileConfig';

const BARREL_AXIS = new THREE.Vector3(1, 0, 0);

const _aimPoint = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _muzzleBack = new THREE.Vector3();
const _ndcNear = new THREE.Vector3();
const _ndcFar = new THREE.Vector3();
const _ventWorld = new THREE.Vector3();
const _ventLocal = new THREE.Vector3();
const _flashQuatInv = new THREE.Quaternion();
const FIRE_FORWARD = new THREE.Vector3(0, 0, -1);

function getMuzzleObject(weapon: THREE.Object3D): THREE.Object3D {
  const cached = weapon.userData.weaponMuzzle as THREE.Object3D | undefined;
  return cached ?? weapon.getObjectByName('muzzle') ?? weapon;
}

function getSideVentObjects(weapon: THREE.Object3D): THREE.Object3D[] {
  const cached = weapon.userData.weaponSideVents as THREE.Object3D[] | undefined;
  if (cached?.length) return cached;
  const left = weapon.getObjectByName('muzzle_vent_l');
  const right = weapon.getObjectByName('muzzle_vent_r');
  if (left && right) return [left, right];
  return [];
}

export function readWeaponMuzzleWorldPosition(
  weapon: THREE.Object3D,
  position: THREE.Vector3,
): void {
  getMuzzleObject(weapon).getWorldPosition(position);
}

/**
 * Side-vent offsets in muzzle-flash local space (±X = lateral, -Z = bore).
 * Reuses `out` — call `out.length = 0` before use if you need a fresh list.
 */
export function readWeaponSideVentFlashOffsets(
  weapon: THREE.Object3D,
  muzzleOrigin: THREE.Vector3,
  fireDirection: THREE.Vector3,
  out: THREE.Vector3[],
): number {
  const vents = getSideVentObjects(weapon);
  if (vents.length === 0) return 0;

  _flashQuatInv.setFromUnitVectors(FIRE_FORWARD, _muzzleDir.copy(fireDirection).normalize());
  _flashQuatInv.invert();

  out.length = 0;
  for (const vent of vents) {
    vent.getWorldPosition(_ventWorld);
    _ventLocal.copy(_ventWorld).sub(muzzleOrigin).applyQuaternion(_flashQuatInv);
    out.push(_ventLocal.clone());
  }
  return out.length;
}

function readMuzzlePosition(weapon: THREE.Object3D, position: THREE.Vector3): void {
  readWeaponMuzzleWorldPosition(weapon, position);
}

/** World-space ray through a screen pixel (crosshair position). */
export function readCrosshairWorldRay(
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  screenOffsetX: number,
  screenOffsetY: number,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  const ndcX = ((viewportWidth * 0.5 + screenOffsetX) / viewportWidth) * 2 - 1;
  const ndcY = -((viewportHeight * 0.5 + screenOffsetY) / viewportHeight) * 2 + 1;

  _ndcNear.set(ndcX, ndcY, 0).unproject(camera);
  _ndcFar.set(ndcX, ndcY, 1).unproject(camera);
  origin.copy(_ndcNear);
  direction.subVectors(_ndcFar, _ndcNear).normalize();
}

/** World-space bore direction from the muzzle (includes sway / visual recoil). Cosmetic only for FP aim. */
export function readMuzzleWorldAimDirection(
  weapon: THREE.Object3D,
  direction: THREE.Vector3,
): void {
  const muzzle = getMuzzleObject(weapon);
  muzzle.getWorldPosition(_muzzlePos);
  _muzzleBack.copy(BARREL_AXIS).multiplyScalar(-0.05).applyMatrix4(muzzle.matrixWorld);
  direction.subVectors(_muzzlePos, _muzzleBack).normalize();
}

/**
 * Fire from the muzzle along the bore.
 * Prefer camera-center hit rays for gameplay; keep this for bore-aligned VFX helpers.
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

/**
 * Pixel offset from screen center for where the muzzle bore is pointing.
 * Not used for gameplay aim (crosshair stays center); retained for debug / tooling.
 */
export function projectMuzzleAimToScreenOffset(
  weapon: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
  target: ScreenOffset2D,
): void {
  weapon.updateMatrixWorld(true);
  readMuzzlePosition(weapon, _muzzlePos);
  readMuzzleWorldAimDirection(weapon, _muzzleDir);
  _aimPoint.copy(_muzzlePos).addScaledVector(_muzzleDir, MAX_AIM_DISTANCE);
  _aimPoint.project(camera);

  target.x = (_aimPoint.x * 0.5 + 0.5) * width - width * 0.5;
  target.y = (-_aimPoint.y * 0.5 + 0.5) * height - height * 0.5;
}

/**
 * World position for an object held at a screen offset (e.g. grenade lower-left).
 * Aim direction is unchanged — only the spawn point moves on screen.
 */
export function readScreenHoldWorldPosition(
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  screenOffsetX: number,
  screenOffsetY: number,
  armDepth: number,
  position: THREE.Vector3,
): void {
  readCrosshairWorldRay(
    camera,
    viewportWidth,
    viewportHeight,
    screenOffsetX,
    screenOffsetY,
    _ndcNear,
    _muzzleDir,
  );
  position.copy(_ndcNear).addScaledVector(_muzzleDir, armDepth);
}
