import * as THREE from 'three';
import {
  AIM_PITCH_LIMIT,
  applyLookPitch,
  applyLookYaw,
} from './playerAim';
import { getStoredMouseSensitivity } from '../settings/mouseSensitivity';
import { MatchPerfStats } from '../debug/MatchPerfStats';
import { MatchPlaytestLog } from '../debug/MatchPlaytestLog';

const MOUSE_SENSITIVITY = 0.002;

/**
 * Pointer-lock look with yaw and pitch on separate rigs so pitch can be
 * clamped before recoil is layered on.
 */
export class PointerAimControls {
  readonly yawRig: THREE.Object3D;
  readonly pitchRig: THREE.Object3D;

  isLocked = false;
  /** Per-frame ADS modifier — overwritten by Player, do not persist here. */
  pointerSpeed = 1;
  /** User setting from the lobby SETTINGS menu (localStorage). */
  userSensitivity = getStoredMouseSensitivity();
  lookYaw = 0;
  lookPitch = 0;

  onLock: (() => void) | null = null;
  onUnlock: (() => void) | null = null;
  /** Pointer released without pausing (inventory, tactical map, key 5). */
  onSoftUnlock: (() => void) | null = null;
  /** Browser rejected requestPointerLock — UI should offer click-to-retry. */
  onLockError: (() => void) | null = null;

  private readonly domElement: HTMLElement;
  /**
   * Stays true from unlockSoft() until the next successful lock.
   * Prevents spurious pointerlockchange events from showing the pause overlay
   * while inventory / other panels have the cursor free on purpose.
   */
  private suppressPauseUntilRelock = false;

  constructor(yawRig: THREE.Object3D, pitchRig: THREE.Object3D, domElement: HTMLElement) {
    this.yawRig = yawRig;
    this.pitchRig = pitchRig;
    this.domElement = domElement;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onPointerlockChange = this.onPointerlockChange.bind(this);
    this.onPointerlockError = this.onPointerlockError.bind(this);

    const doc = domElement.ownerDocument;
    doc.addEventListener('mousemove', this.onMouseMove);
    doc.addEventListener('pointerlockchange', this.onPointerlockChange);
    doc.addEventListener('pointerlockerror', this.onPointerlockError);
  }

  dispose(): void {
    const doc = this.domElement.ownerDocument;
    doc.removeEventListener('mousemove', this.onMouseMove);
    doc.removeEventListener('pointerlockchange', this.onPointerlockChange);
    doc.removeEventListener('pointerlockerror', this.onPointerlockError);
  }

  lock(unadjustedMovement = false): void {
    this.domElement.requestPointerLock({ unadjustedMovement });
  }

  unlock(): void {
    this.suppressPauseUntilRelock = false;
    this.domElement.ownerDocument.exitPointerLock();
  }

  /** Release the cursor without triggering the pause/unlock UI flow. */
  unlockSoft(): void {
    this.suppressPauseUntilRelock = true;
    if (!this.isLocked) {
      this.onSoftUnlock?.();
      return;
    }
    this.domElement.ownerDocument.exitPointerLock();
  }

  /** True while a panel has intentionally freed the cursor. */
  get isSoftUnlocked(): boolean {
    return this.suppressPauseUntilRelock && !this.isLocked;
  }

  resetLook(yaw = 0): void {
    this.lookYaw = yaw;
    this.lookPitch = 0;
    this.applyLook();
  }

  applyLook(): void {
    applyLookYaw(this.yawRig, this.lookYaw);
    applyLookPitch(this.pitchRig, this.lookPitch);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isLocked) return;

    const sensitivity = MOUSE_SENSITIVITY * this.userSensitivity * this.pointerSpeed;
    this.lookYaw -= event.movementX * sensitivity;
    this.lookPitch -= event.movementY * sensitivity;
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
    this.applyLook();
  }

  private onPointerlockChange(): void {
    if (this.domElement.ownerDocument.pointerLockElement === this.domElement) {
      this.suppressPauseUntilRelock = false;
      this.isLocked = true;
      MatchPerfStats.setPointerLocked(true);
      MatchPlaytestLog.pointerLockChange(true);
      this.onLock?.();
      return;
    }

    this.isLocked = false;
    MatchPerfStats.setPointerLocked(false);
    MatchPlaytestLog.pointerLockChange(false);
    if (this.suppressPauseUntilRelock) {
      this.onSoftUnlock?.();
      return;
    }

    this.onUnlock?.();
  }

  private onPointerlockError(): void {
    console.error('PointerAimControls: Unable to use Pointer Lock API');
    MatchPerfStats.recordPointerLockError();
    MatchPlaytestLog.pointerLockError();
    this.onLockError?.();
  }
}
