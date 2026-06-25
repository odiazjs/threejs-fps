import type * as THREE from 'three';
import { PointerAimControls } from './PointerAimControls';
import type { CrosshairHud } from '../ui/CrosshairHud';
import type { StaminaHud } from '../ui/StaminaHud';
import type { AmmoHud } from '../ui/AmmoHud';
import type { HealthHud } from '../ui/HealthHud';
import type { KillFeedHud } from '../ui/KillFeedHud';

export class PlayerControls {
  readonly controls: PointerAimControls;
  private staminaHud: StaminaHud | null = null;
  private ammoHud: AmmoHud | null = null;
  private healthHud: HealthHud | null = null;
  private killFeedHud: KillFeedHud | null = null;
  private crosshairHud: CrosshairHud | null = null;
  private onLeave: (() => void) | null = null;
  private hasLockedOnce = false;

  private readonly blocker: HTMLElement;
  private readonly instructionsTitle: HTMLElement;
  private readonly leaveButton: HTMLButtonElement;

  constructor(yawRig: THREE.Object3D, pitchRig: THREE.Object3D) {
    this.blocker = document.getElementById('blocker')!;
    this.instructionsTitle = this.blocker.querySelector('#instructions h1')!;
    this.leaveButton = document.getElementById('leave-game-btn') as HTMLButtonElement;

    this.controls = new PointerAimControls(yawRig, pitchRig, document.body);
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

  setCrosshairHud(hud: CrosshairHud): void {
    this.crosshairHud = hud;
  }

  setKillFeedHud(hud: KillFeedHud): void {
    this.killFeedHud = hud;
  }

  setLeaveHandler(handler: () => void): void {
    this.onLeave = handler;
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  private initUI(): void {
    this.blocker.addEventListener('click', () => {
      if (!this.leaveButton.disabled) {
        this.controls.lock();
      }
    });

    this.leaveButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.leaveButton.disabled) return;
      this.onLeave?.();
    });

    this.controls.onLock = () => {
      this.hasLockedOnce = true;
      this.blocker.style.display = 'none';
      this.leaveButton.hidden = true;
      this.crosshairHud?.setVisible(true);
      this.staminaHud?.setVisible(true);
      this.ammoHud?.setVisible(true);
      this.healthHud?.setVisible(true);
      this.killFeedHud?.setVisible(true);
      document.addEventListener('contextmenu', this.preventContextMenu);
    };

    this.controls.onUnlock = () => {
      this.blocker.style.display = 'flex';
      this.crosshairHud?.setVisible(false);
      this.staminaHud?.setVisible(false);
      this.ammoHud?.setVisible(false);
      this.healthHud?.setVisible(false);
      this.killFeedHud?.setVisible(false);
      document.removeEventListener('contextmenu', this.preventContextMenu);

      if (this.hasLockedOnce) {
        this.instructionsTitle.textContent = 'Paused';
        this.leaveButton.hidden = false;
      } else {
        this.instructionsTitle.textContent = 'Click to play';
        this.leaveButton.hidden = true;
      }
    };
  }

  setLeaveEnabled(enabled: boolean): void {
    this.leaveButton.disabled = !enabled;
  }

  private preventContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };
}
