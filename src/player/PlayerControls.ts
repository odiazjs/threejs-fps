import type * as THREE from 'three';
import { PointerAimControls } from './PointerAimControls';
import type { ControlsHelpHud } from '../ui/ControlsHelpHud';
import type { CrosshairHud } from '../ui/CrosshairHud';
import type { ThrowableHud } from '../ui/ThrowableHud';
import type { StaminaHud } from '../ui/StaminaHud';
import type { AmmoHud } from '../ui/AmmoHud';
import type { HealthHud } from '../ui/HealthHud';
import type { KillFeedHud } from '../ui/KillFeedHud';
import type { DamageIndicatorHud } from '../ui/DamageIndicatorHud';
import type { GrenadeThreatIndicatorHud } from '../ui/GrenadeThreatIndicatorHud';
import type { PingDirectionIndicatorHud } from '../ui/PingDirectionIndicatorHud';
import type { ShieldRechargeHud } from '../ui/ShieldRechargeHud';
import type { ShieldDomeHud } from '../ui/ShieldDomeHud';
import type { ShieldPickupHud } from '../ui/ShieldPickupHud';
import type { TeamHud } from '../ui/TeamHud';
import type { MinimapHud } from '../ui/MinimapHud';

export class PlayerControls {
  readonly controls: PointerAimControls;
  private staminaHud: StaminaHud | null = null;
  private throwableHud: ThrowableHud | null = null;
  private ammoHud: AmmoHud | null = null;
  private healthHud: HealthHud | null = null;
  private killFeedHud: KillFeedHud | null = null;
  private damageIndicatorHud: DamageIndicatorHud | null = null;
  private grenadeThreatIndicatorHud: GrenadeThreatIndicatorHud | null = null;
  private pingDirectionIndicatorHud: PingDirectionIndicatorHud | null = null;
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
  private deadBlocked = false;

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

  setThrowableHud(hud: ThrowableHud): void {
    this.throwableHud = hud;
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

  setGrenadeThreatIndicatorHud(hud: GrenadeThreatIndicatorHud): void {
    this.grenadeThreatIndicatorHud = hud;
  }

  setPingDirectionIndicatorHud(hud: PingDirectionIndicatorHud): void {
    this.pingDirectionIndicatorHud = hud;
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

  /** While dead, clicking must not re-lock the pointer — wait for respawn. */
  setDeadBlocked(blocked: boolean): void {
    this.deadBlocked = blocked;
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  /** In-game and not ESC-paused (HUD active; may be soft-unlocked). */
  get isPlaying(): boolean {
    return this.hasLockedOnce && !this.isPaused;
  }

  /** ESC pause screen currently covering the game. */
  get isPauseOverlayVisible(): boolean {
    return this.isPaused && this.hasLockedOnce;
  }

  /** ESC on the pause overlay — hide it and resume play. */
  resumeFromPause(): void {
    if (!this.isPauseOverlayVisible) return;
    this.isPaused = false;
    this.blocker.style.display = 'none';
    this.leaveButton.hidden = true;
    this.setPlayHudVisible(true);
    this.crosshairHud?.setVisible(!this.deadBlocked);
    document.addEventListener('contextmenu', this.preventContextMenu);

    // Deferred so the browser finishes processing the ESC press first —
    // locking during it gets immediately kicked back out. If the browser
    // still refuses (pointer-lock cooldown after an ESC exit), the next
    // click re-locks via the body click handler.
    window.setTimeout(() => {
      if (this.isPaused || this.deadBlocked) return;
      if (this.inventoryOpen || this.tacticalMapOpen) return;
      if (!this.controls.isLocked) this.controls.lock();
    }, 250);
  }

  private initUI(): void {
    this.blocker.addEventListener('click', () => {
      this.onEngage?.();
      if (!this.leaveButton.disabled) {
        this.controls.lock();
      }
    });

    document.body.addEventListener('click', (event) => {
      if (this.inventoryOpen || this.tacticalMapOpen || this.deadBlocked) return;
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
      this.setPlayHudVisible(true);
      document.addEventListener('contextmenu', this.preventContextMenu);
    };

    this.controls.onUnlock = () => {
      this.isPaused = true;
      this.blocker.style.display = 'flex';
      this.setPlayHudVisible(false);
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

  private setPlayHudVisible(visible: boolean): void {
    this.crosshairHud?.setVisible(visible);
    this.staminaHud?.setVisible(visible);
    this.throwableHud?.setVisible(visible);
    this.ammoHud?.setVisible(visible);
    this.healthHud?.setVisible(visible);
    this.shieldRechargeHud?.setVisible(visible);
    this.shieldDomeHud?.setVisible(visible);
    this.weaponPickupHud?.setVisible(visible);
    this.shieldPickupHud?.setVisible(visible);
    this.killFeedHud?.setVisible(visible);
    this.damageIndicatorHud?.setVisible(visible);
    this.grenadeThreatIndicatorHud?.setVisible(visible);
    this.pingDirectionIndicatorHud?.setVisible(visible);
    this.teamHud?.setVisible(visible);
    this.controlsHelpHud?.setVisible(visible);
    this.minimapHud?.setVisible(visible);
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
