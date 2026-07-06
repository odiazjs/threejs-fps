import { getWeaponConfig } from '../content/weaponConfig';
import { isPickableWeaponId } from '../../shared/content/weaponIds';

export interface WeaponPickupTarget {
  index: number;
  weaponId: string;
}

const PICKUP_HOLD_MS = 1000;
const PICKUP_RING_RADIUS = 34;
const PICKUP_RING_CIRCUMFERENCE = 2 * Math.PI * PICKUP_RING_RADIUS;

export class WeaponPickupHud {
  private readonly promptRoot: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly progressRoot: HTMLElement;
  private readonly progressFill: SVGCircleElement;
  private readonly progressTimer: HTMLElement;
  private holdStart = 0;
  private holdRafId = 0;
  private holding = false;
  private holdTarget: WeaponPickupTarget | null = null;
  private hudVisible = false;
  private onComplete: ((target: WeaponPickupTarget) => void) | null = null;
  /** After a hold completes, wait for F to be released before starting again. */
  private awaitingKeyRelease = false;

  constructor() {
    this.promptRoot = document.getElementById('weapon-pickup-prompt')!;
    this.promptText = this.promptRoot.querySelector('.weapon-pickup-prompt-text')!;
    this.progressRoot = document.getElementById('weapon-pickup-progress')!;
    this.progressFill = this.progressRoot.querySelector(
      '.weapon-pickup-ring-fill',
    ) as SVGCircleElement;
    this.progressTimer = this.progressRoot.querySelector('.weapon-pickup-timer')!;
    this.progressFill.style.strokeDasharray = String(PICKUP_RING_CIRCUMFERENCE);
    this.progressFill.style.strokeDashoffset = String(PICKUP_RING_CIRCUMFERENCE);
  }

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    if (!visible) {
      this.cancelHold();
      this.promptRoot.hidden = true;
      this.progressRoot.hidden = true;
    }
  }

  update(
    target: WeaponPickupTarget | null,
    keyHeld: boolean,
    onComplete: (target: WeaponPickupTarget) => void,
  ): void {
    if (!this.hudVisible) {
      this.cancelHold();
      return;
    }

    if (!keyHeld) {
      this.awaitingKeyRelease = false;
    }

    if (!target || !keyHeld || !isPickableWeaponId(target.weaponId)) {
      this.cancelHold();
      this.updatePrompt(target);
      return;
    }

    if (this.awaitingKeyRelease) {
      this.promptRoot.hidden = true;
      return;
    }

    this.promptRoot.hidden = true;

    if (!this.holding) {
      this.holdTarget = target;
      this.onComplete = onComplete;
      this.holding = true;
      this.holdStart = performance.now();
      this.progressRoot.hidden = false;
      this.tickHold();
    }
  }

  private updatePrompt(target: WeaponPickupTarget | null): void {
    if (!this.hudVisible || this.holding) {
      this.promptRoot.hidden = true;
      return;
    }

    if (!target || !isPickableWeaponId(target.weaponId)) {
      this.promptRoot.hidden = true;
      return;
    }

    const name = getWeaponConfig(target.weaponId)?.name ?? target.weaponId;
    this.promptText.textContent = `Pickup weapon ${name} — press F`;
    this.promptRoot.hidden = false;
  }

  cancelHold(): void {
    if (this.holdRafId) {
      cancelAnimationFrame(this.holdRafId);
      this.holdRafId = 0;
    }
    this.holding = false;
    this.holdStart = 0;
    this.holdTarget = null;
    this.onComplete = null;
    this.progressRoot.hidden = true;
    this.progressFill.style.strokeDashoffset = String(PICKUP_RING_CIRCUMFERENCE);
  }

  private tickHold = (): void => {
    if (!this.holding) return;

    const elapsed = performance.now() - this.holdStart;
    const progress = Math.min(1, elapsed / PICKUP_HOLD_MS);
    const remaining = Math.max(0, PICKUP_HOLD_MS - elapsed) / 1000;

    this.progressTimer.textContent = `Picking up weapon ${remaining.toFixed(1)}s`;
    this.progressFill.style.strokeDashoffset = String(
      PICKUP_RING_CIRCUMFERENCE * (1 - progress),
    );

    if (elapsed >= PICKUP_HOLD_MS) {
      const complete = this.onComplete;
      const target = this.holdTarget;
      this.awaitingKeyRelease = true;
      this.cancelHold();
      if (complete && target) complete(target);
      return;
    }

    this.holdRafId = requestAnimationFrame(this.tickHold);
  };
}
