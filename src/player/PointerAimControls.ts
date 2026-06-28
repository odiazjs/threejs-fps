import * as THREE from 'three';
import {
  AIM_PITCH_LIMIT,
  applyLookPitch,
  applyLookYaw,
} from './playerAim';

const MOUSE_SENSITIVITY = 0.002;

/**
 * Pointer-lock look with yaw and pitch on separate rigs so pitch can be
 * clamped before recoil is layered on.
 */
export class PointerAimControls {
  readonly yawRig: THREE.Object3D;
  readonly pitchRig: THREE.Object3D;

  isLocked = false;
  pointerSpeed = 1;
  lookYaw = 0;
  lookPitch = 0;

  onLock: (() => void) | null = null;
  onUnlock: (() => void) | null = null;
  /** Pointer released without pausing (e.g. key 5). */
  onSoftUnlock: (() => void) | null = null;

  private readonly domElement: HTMLElement;
  private softUnlockPending = false;

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
    this.domElement.ownerDocument.exitPointerLock();
  }

  /** Release the cursor without triggering the pause/unlock UI flow. */
  unlockSoft(): void {
    if (!this.isLocked) return;
    this.softUnlockPending = true;
    this.domElement.ownerDocument.exitPointerLock();
  }

  resetLook(): void {
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.applyLook();
  }

  applyLook(): void {
    applyLookYaw(this.yawRig, this.lookYaw);
    applyLookPitch(this.pitchRig, this.lookPitch);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isLocked) return;

    this.lookYaw -= event.movementX * MOUSE_SENSITIVITY * this.pointerSpeed;
    this.lookPitch -= event.movementY * MOUSE_SENSITIVITY * this.pointerSpeed;
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
    this.applyLook();
  }

  private onPointerlockChange(): void {
    if (this.domElement.ownerDocument.pointerLockElement === this.domElement) {
      this.softUnlockPending = false;
      this.isLocked = true;
      this.onLock?.();
      return;
    }

    this.isLocked = false;
    if (this.softUnlockPending) {
      this.softUnlockPending = false;
      this.onSoftUnlock?.();
      return;
    }

    this.onUnlock?.();
  }

  private onPointerlockError(): void {
    console.error('PointerAimControls: Unable to use Pointer Lock API');
  }
}
