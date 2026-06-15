import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class PlayerControls {
  readonly controls: PointerLockControls;

  constructor(camera: THREE.Camera) {
    this.controls = new PointerLockControls(camera, document.body);
    this.initUI();
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  private initUI(): void {
    const blocker = document.getElementById('blocker')!;
    const crosshair = document.getElementById('crosshair')!;

    blocker.addEventListener('click', () => this.controls.lock());
    this.controls.addEventListener('lock', () => {
      blocker.style.display = 'none';
      crosshair.style.display = 'block';
    });
    this.controls.addEventListener('unlock', () => {
      blocker.style.display = 'flex';
      crosshair.style.display = 'none';
    });
  }
}
