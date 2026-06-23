import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { StaminaHud } from '../ui/StaminaHud';

export class PlayerControls {
  readonly controls: PointerLockControls;
  private staminaHud: StaminaHud | null = null;

  constructor(camera: THREE.Camera) {
    this.controls = new PointerLockControls(camera, document.body);
    this.initUI();
  }

  setStaminaHud(hud: StaminaHud): void {
    this.staminaHud = hud;
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
      this.staminaHud?.setVisible(true);
    });
    this.controls.addEventListener('unlock', () => {
      blocker.style.display = 'flex';
      crosshair.style.display = 'none';
      this.staminaHud?.setVisible(false);
    });
  }
}
