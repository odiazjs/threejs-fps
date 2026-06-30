export interface ShieldPickupTarget {
  index: number;
}

const PICKUP_HOLD_MS = 1000;
const PICKUP_RING_RADIUS = 34;
const PICKUP_RING_CIRCUMFERENCE = 2 * Math.PI * PICKUP_RING_RADIUS;

export class ShieldPickupHud {
  private readonly promptRoot: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly progressRoot: HTMLElement;
  private readonly progressFill: SVGCircleElement;
  private readonly progressTimer: HTMLElement;
  private holdStart = 0;
  private holdRafId = 0;
  private holding = false;
  private holdTarget: ShieldPickupTarget | null = null;
  private hudVisible = false;
  private onComplete: ((target: ShieldPickupTarget) => void) | null = null;

  constructor() {
    this.promptRoot = document.getElementById('shield-pickup-prompt')!;
    this.promptText = this.promptRoot.querySelector('.shield-pickup-prompt-text')!;
    this.progressRoot = document.getElementById('shield-pickup-progress')!;
    this.progressFill = this.progressRoot.querySelector(
      '.shield-pickup-ring-fill',
    ) as SVGCircleElement;
    this.progressTimer = this.progressRoot.querySelector('.shield-pickup-timer')!;
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
    target: ShieldPickupTarget | null,
    keyHeld: boolean,
    onComplete: (target: ShieldPickupTarget) => void,
  ): void {
    if (!this.hudVisible) {
      this.cancelHold();
      return;
    }

    if (!target || !keyHeld) {
      this.cancelHold();
      this.updatePrompt(target);
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

  private updatePrompt(target: ShieldPickupTarget | null): void {
    if (!this.hudVisible || this.holding) {
      this.promptRoot.hidden = true;
      return;
    }

    if (!target) {
      this.promptRoot.hidden = true;
      return;
    }

    this.promptText.textContent = 'Pickup shield charge — press F';
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

    this.progressTimer.textContent = `Picking up shield charge ${remaining.toFixed(1)}s`;
    this.progressFill.style.strokeDashoffset = String(
      PICKUP_RING_CIRCUMFERENCE * (1 - progress),
    );

    if (elapsed >= PICKUP_HOLD_MS) {
      const complete = this.onComplete;
      const target = this.holdTarget;
      this.cancelHold();
      if (complete && target) complete(target);
      return;
    }

    this.holdRafId = requestAnimationFrame(this.tickHold);
  };
}
