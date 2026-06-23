import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { StaminaHud } from '../ui/StaminaHud';
import type { AmmoHud } from '../ui/AmmoHud';
import type { HealthHud } from '../ui/HealthHud';
import type { KillFeedHud } from '../ui/KillFeedHud';

export class PlayerControls {
  readonly controls: PointerLockControls;
  private staminaHud: StaminaHud | null = null;
  private ammoHud: AmmoHud | null = null;
  private healthHud: HealthHud | null = null;
  private killFeedHud: KillFeedHud | null = null;

  constructor(camera: THREE.Camera) {
    this.controls = new PointerLockControls(camera, document.body);
    this.initUI();
  }

  setStaminaHud(hud: StaminaHud): void {
    this.staminaHud = hud;
  }

  setAmmoHud(hud: AmmoHud): void {
    this.ammoHud = hud;
  }

  setHealthHud(hud: HealthHud): void {
    this.healthHud = hud;
  }

  setKillFeedHud(hud: KillFeedHud): void {
    this.killFeedHud = hud;
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
      this.ammoHud?.setVisible(true);
      this.healthHud?.setVisible(true);
      this.killFeedHud?.setVisible(true);
      document.addEventListener('contextmenu', this.preventContextMenu);
    });
    this.controls.addEventListener('unlock', () => {
      blocker.style.display = 'flex';
      crosshair.style.display = 'none';
      this.staminaHud?.setVisible(false);
      this.ammoHud?.setVisible(false);
      this.healthHud?.setVisible(false);
      this.killFeedHud?.setVisible(false);
      document.removeEventListener('contextmenu', this.preventContextMenu);
    });
  }

  private preventContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };
}
