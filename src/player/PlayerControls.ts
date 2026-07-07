import type * as THREE from 'three';
import { PointerAimControls } from './PointerAimControls';
import type { ControlsHelpHud } from '../ui/ControlsHelpHud';
import type { CrosshairHud } from '../ui/CrosshairHud';
import type { StaminaHud } from '../ui/StaminaHud';
import type { AmmoHud } from '../ui/AmmoHud';
import type { HealthHud } from '../ui/HealthHud';
import type { KillFeedHud } from '../ui/KillFeedHud';
import type { DamageIndicatorHud } from '../ui/DamageIndicatorHud';
import type { ShieldRechargeHud } from '../ui/ShieldRechargeHud';
import type { ShieldDomeHud } from '../ui/ShieldDomeHud';
import type { ShieldPickupHud } from '../ui/ShieldPickupHud';
import type { TeamHud } from '../ui/TeamHud';
import type { MinimapHud } from '../ui/MinimapHud';

export class PlayerControls {
  readonly controls: PointerAimControls;
  private staminaHud: StaminaHud | null = null;
  private ammoHud: AmmoHud | null = null;
  private healthHud: HealthHud | null = null;
  private killFeedHud: KillFeedHud | null = null;
  private damageIndicatorHud: DamageIndicatorHud | null = null;
  private shieldRechargeHud: ShieldRechargeHud | null = null;
  private shieldDomeHud: ShieldDomeHud | null = null;
  private weaponPickupHud: WeaponPickupHud | null = null;
  private shieldPickupHud: ShieldPickupHud | null = null;
  private teamHud: TeamHud | null = null;
  private controlsHelpHud: ControlsHelpHud | null = null;
  private minimapHud: MinimapHud | null = null;
  private crosshairHud: CrosshairHud | null = null;
  private onLeave: (() => void) | null = null;
  private onEngage: (() => void) | null = null;
  private hasLockedOnce = false;
  private isPaused = false;
  private inventoryOpen = false;
  private tacticalMapOpen = false;

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

  setDamageIndicatorHud(hud: DamageIndicatorHud): void {
    this.damageIndicatorHud = hud;
  }

  setShieldRechargeHud(hud: ShieldRechargeHud): void {
    this.shieldRechargeHud = hud;
  }

  setShieldDomeHud(hud: ShieldDomeHud): void {
    this.shieldDomeHud = hud;
  }

  setWeaponPickupHud(hud: WeaponPickupHud): void {
    this.weaponPickupHud = hud;
  }

  setShieldPickupHud(hud: ShieldPickupHud): void {
    this.shieldPickupHud = hud;
  }

  setTeamHud(hud: TeamHud): void {
    this.teamHud = hud;
  }

  setControlsHelpHud(hud: ControlsHelpHud): void {
    this.controlsHelpHud = hud;
  }

  setMinimapHud(hud: MinimapHud): void {
    this.minimapHud = hud;
  }

  setLeaveHandler(handler: () => void): void {
    this.onLeave = handler;
  }

  /** Fired on click-to-play / re-engage (user gesture — safe for audio unlock). */
  setEngageHandler(handler: () => void): void {
    this.onEngage = handler;
  }

  setInventoryOpen(open: boolean): void {
    this.inventoryOpen = open;
  }

  setTacticalMapOpen(open: boolean): void {
    this.tacticalMapOpen = open;
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  /** In-game and not ESC-paused (HUD active; may be soft-unlocked). */
  get isPlaying(): boolean {
    return this.hasLockedOnce && !this.isPaused;
  }

  private initUI(): void {
    this.blocker.addEventListener('click', () => {
      this.onEngage?.();
      if (!this.leaveButton.disabled) {
        this.controls.lock();
      }
    });

    document.body.addEventListener('click', (event) => {
      if (this.inventoryOpen || this.tacticalMapOpen) return;
      if (this.isPaused || this.controls.isLocked || !this.hasLockedOnce) return;
      if (event.target === this.leaveButton) return;
      this.onEngage?.();
      this.controls.lock();
    });

    document.addEventListener('keydown', this.onKeyDown);

    this.leaveButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.leaveButton.disabled) return;
      this.onLeave?.();
    });

    this.controls.onLock = () => {
      this.hasLockedOnce = true;
      this.isPaused = false;
      this.blocker.style.display = 'none';
      this.leaveButton.hidden = true;
      this.crosshairHud?.setVisible(true);
      this.staminaHud?.setVisible(true);
      this.ammoHud?.setVisible(true);
      this.healthHud?.setVisible(true);
      this.shieldRechargeHud?.setVisible(true);
      this.shieldDomeHud?.setVisible(true);
      this.weaponPickupHud?.setVisible(true);
      this.shieldPickupHud?.setVisible(true);
      this.killFeedHud?.setVisible(true);
      this.damageIndicatorHud?.setVisible(true);
      this.teamHud?.setVisible(true);
      this.controlsHelpHud?.setVisible(true);
      this.minimapHud?.setVisible(true);
      document.addEventListener('contextmenu', this.preventContextMenu);
    };

    this.controls.onUnlock = () => {
      this.isPaused = true;
      this.blocker.style.display = 'flex';
      this.crosshairHud?.setVisible(false);
      this.staminaHud?.setVisible(false);
      this.ammoHud?.setVisible(false);
      this.healthHud?.setVisible(false);
      this.shieldRechargeHud?.setVisible(false);
      this.shieldDomeHud?.setVisible(false);
      this.weaponPickupHud?.setVisible(false);
      this.shieldPickupHud?.setVisible(false);
      this.killFeedHud?.setVisible(false);
      this.damageIndicatorHud?.setVisible(false);
      this.teamHud?.setVisible(false);
      this.controlsHelpHud?.setVisible(false);
      this.minimapHud?.setVisible(false);
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

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Digit5' || !this.controls.isLocked || this.isPaused) return;
    event.preventDefault();
    this.controls.unlockSoft();
  };
}
