import {
  holdSecForHarvestingBoxMode,
} from '../../shared/level/harvestingBoxSpawns';

export type HarvestingBoxHoldMode = 'pickup' | 'drop' | 'install';

export interface HarvestingBoxHoldTarget {
  index: number;
  mode: HarvestingBoxHoldMode;
}

/**
 * Hold-F progress for harvesting crates (3s pickup/drop, 10s install).
 */
export class HarvestingBoxHud {
  private readonly promptRoot: HTMLElement | null;
  private readonly promptText: HTMLElement | null;
  private readonly progressRoot: HTMLElement | null;
  private readonly progressFill: SVGCircleElement | null;
  private readonly progressTimer: HTMLElement | null;
  private readonly ringCircumference: number;
  private holdStart = 0;
  private holdRafId = 0;
  private holding = false;
  private holdTarget: HarvestingBoxHoldTarget | null = null;
  private hudVisible = false;
  private onComplete: ((target: HarvestingBoxHoldTarget) => void) | null = null;
  private onInstallHoldChange: ((holding: boolean) => void) | null = null;
  private installHoldReported = false;

  constructor() {
    this.promptRoot = document.getElementById('harvesting-box-prompt');
    this.promptText = this.promptRoot?.querySelector('.harvesting-box-prompt-text') ?? null;
    this.progressRoot = document.getElementById('harvesting-box-progress');
    this.progressFill = this.progressRoot?.querySelector(
      '.harvesting-box-ring-fill',
    ) as SVGCircleElement | null;
    this.progressTimer = this.progressRoot?.querySelector('.harvesting-box-timer') ?? null;
    const radius = 34;
    this.ringCircumference = 2 * Math.PI * radius;
    if (this.progressFill) {
      this.progressFill.style.strokeDasharray = String(this.ringCircumference);
      this.progressFill.style.strokeDashoffset = String(this.ringCircumference);
    }
  }

  setOnInstallHoldChange(handler: ((holding: boolean) => void) | null): void {
    this.onInstallHoldChange = handler;
  }

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    if (!visible) {
      this.cancelHold();
      if (this.promptRoot) this.promptRoot.hidden = true;
      if (this.progressRoot) this.progressRoot.hidden = true;
    }
  }

  update(
    target: HarvestingBoxHoldTarget | null,
    keyHeld: boolean,
    onComplete: (target: HarvestingBoxHoldTarget) => void,
  ): void {
    if (!this.hudVisible || !this.promptRoot) {
      this.cancelHold();
      return;
    }

    if (!target || !keyHeld) {
      this.cancelHold();
      this.updatePrompt(target);
      return;
    }

    this.promptRoot.hidden = true;

    if (
      !this.holding ||
      !this.holdTarget ||
      this.holdTarget.index !== target.index ||
      this.holdTarget.mode !== target.mode
    ) {
      this.cancelHold();
      this.holdTarget = target;
      this.onComplete = onComplete;
      this.holding = true;
      this.holdStart = performance.now();
      if (this.progressRoot) this.progressRoot.hidden = false;
      if (target.mode === 'install') {
        this.reportInstallHold(true);
      }
      this.tickHold();
    }
  }

  private reportInstallHold(holding: boolean): void {
    if (holding === this.installHoldReported) return;
    this.installHoldReported = holding;
    this.onInstallHoldChange?.(holding);
  }

  private updatePrompt(target: HarvestingBoxHoldTarget | null): void {
    if (!this.promptRoot || !this.promptText) return;
    if (!this.hudVisible || this.holding) {
      this.promptRoot.hidden = true;
      return;
    }
    if (!target) {
      this.promptRoot.hidden = true;
      return;
    }
    if (target.mode === 'pickup') {
      this.promptText.textContent = 'Hold F - Pick up Harvesting Box';
    } else if (target.mode === 'drop') {
      this.promptText.textContent = 'Hold F - Drop Harvesting Box';
    } else {
      this.promptText.textContent = 'Hold F - Install Harvesting Box';
    }
    this.promptRoot.hidden = false;
  }

  private progressLabel(mode: HarvestingBoxHoldMode): string {
    if (mode === 'pickup') return 'Picking up box';
    if (mode === 'drop') return 'Dropping box';
    return 'Installing box';
  }

  private tickHold = (): void => {
    if (!this.holding || !this.holdTarget) return;
    const elapsed = performance.now() - this.holdStart;
    const holdMs = holdSecForHarvestingBoxMode(this.holdTarget.mode) * 1000;
    const progress = Math.min(1, elapsed / holdMs);
    const remaining = Math.max(0, holdMs - elapsed) / 1000;

    if (this.progressFill) {
      this.progressFill.style.strokeDashoffset = String(
        this.ringCircumference * (1 - progress),
      );
    }
    if (this.progressTimer) {
      this.progressTimer.textContent = `${this.progressLabel(this.holdTarget.mode)}  ${remaining.toFixed(1)}`;
    }

    if (elapsed >= holdMs) {
      const target = this.holdTarget;
      const complete = this.onComplete;
      this.cancelHold();
      complete?.(target);
      return;
    }

    this.holdRafId = requestAnimationFrame(this.tickHold);
  };

  cancelHold(): void {
    if (this.holdRafId) cancelAnimationFrame(this.holdRafId);
    this.holdRafId = 0;
    this.holding = false;
    this.holdTarget = null;
    this.onComplete = null;
    this.reportInstallHold(false);
    if (this.progressRoot) this.progressRoot.hidden = true;
    if (this.progressFill) {
      this.progressFill.style.strokeDashoffset = String(this.ringCircumference);
    }
  }
}
