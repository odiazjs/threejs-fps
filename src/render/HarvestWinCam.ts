import * as THREE from 'three';

/** Zoom-out showcase after a Plasma Harvest install win. */
export const HARVEST_WIN_CINEMATIC_SEC = 5;

const START_DISTANCE = 7;
const START_HEIGHT = 3.2;
const END_DISTANCE = 18;
const END_HEIGHT = 11;
const LOOK_HEIGHT = 0.4;
const ORBIT_YAW = Math.PI * 0.35;

/**
 * Shared spectator camera: eases from a close angle on the installed box
 * out to a wide elevated view over {@link HARVEST_WIN_CINEMATIC_SEC} seconds.
 */
export class HarvestWinCam {
  readonly camera: THREE.PerspectiveCamera;
  private active = false;
  private elapsed = 0;
  private readonly lookAt = new THREE.Vector3();
  private readonly startPos = new THREE.Vector3();
  private readonly endPos = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
  }

  activate(focusX: number, focusY: number, focusZ: number): void {
    this.lookAt.set(focusX, focusY + LOOK_HEIGHT, focusZ);

    const cos = Math.cos(ORBIT_YAW);
    const sin = Math.sin(ORBIT_YAW);
    this.startPos.set(
      focusX + sin * START_DISTANCE,
      focusY + START_HEIGHT,
      focusZ + cos * START_DISTANCE,
    );
    this.endPos.set(
      focusX + sin * END_DISTANCE,
      focusY + END_HEIGHT,
      focusZ + cos * END_DISTANCE,
    );

    this.camera.position.copy(this.startPos);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
    this.elapsed = 0;
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.elapsed = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Returns true once the 5s zoom-out has finished. */
  update(delta: number): boolean {
    if (!this.active) return true;

    this.elapsed = Math.min(HARVEST_WIN_CINEMATIC_SEC, this.elapsed + delta);
    const t = this.elapsed / HARVEST_WIN_CINEMATIC_SEC;
    const eased = t * t * (3 - 2 * t);

    this.scratch.lerpVectors(this.startPos, this.endPos, eased);
    this.camera.position.copy(this.scratch);
    this.camera.lookAt(this.lookAt);

    if (this.elapsed >= HARVEST_WIN_CINEMATIC_SEC) {
      this.active = false;
      return true;
    }
    return false;
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
