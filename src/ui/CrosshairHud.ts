import type { WeaponId } from '../../shared/content/weaponIds';

const HIT_PULSE_SEC = 0.38;
const HIT_ATTACK_SEC = 0.045;
const HIT_HOLD_SEC = 0.12;
const HIT_SCALE_BOOST = 0.75;

type HitMode = 'sniper' | 'weapon';

export class CrosshairHud {
  private readonly root: HTMLElement;
  private readonly referenceRoot: HTMLElement;
  private readonly hitRoot: HTMLElement;
  private readonly weaponReticle: HTMLElement;
  private readonly hitReticle: HTMLElement;
  private hitElapsed = 0;
  private hitMode: HitMode | null = null;
  private aimOffsetX = 0;
  private aimOffsetY = 0;
  /** Master toggle from play/pause/death HUD state. */
  private playVisible = false;
  /** Hidden while ADS with a digital sight; stays on for hip-fire / iron-sight ADS. */
  private hipFireVisible = true;

  constructor() {
    this.root = document.getElementById('crosshair')!;
    this.referenceRoot = document.getElementById('crosshair-reference')!;
    this.hitRoot = document.getElementById('crosshair-hit')!;
    this.weaponReticle = this.root.querySelector('.crosshair-reticle')!;
    this.hitReticle = this.hitRoot.querySelector('.crosshair-reticle')!;
    this.applyRootTransform();
    this.applyVisibility();
  }

  setVisible(visible: boolean): void {
    this.playVisible = visible;
    this.applyVisibility();
    if (!visible) {
      this.resetHit();
      this.setAimOffset(0, 0);
    }
  }

  /** `true` when the HUD reticle should show; `false` when a digital optic owns ADS. */
  setHipFireVisible(visible: boolean): void {
    if (this.hipFireVisible === visible) return;
    this.hipFireVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const crosshairDisplay = this.playVisible && this.hipFireVisible ? 'block' : 'none';
    this.root.style.display = crosshairDisplay;
    this.referenceRoot.style.display = crosshairDisplay;
    // Hit pulse can show during ADS even when the hip/iron-sight reticle is hidden.
    const hitDisplay =
      this.playVisible && (this.hipFireVisible || this.hitMode != null) ? 'block' : 'none';
    this.hitRoot.style.display = hitDisplay;
  }

  setAimOffset(x: number, y: number): void {
    this.aimOffsetX = x;
    this.aimOffsetY = y;
    this.applyRootTransform();
  }

  onHit(weaponId: WeaponId): void {
    this.hitElapsed = 0;

    // ADS with a digital sight hides the hip reticle — use the dedicated red hit pulse.
    if (!this.hipFireVisible || weaponId === 'sniper_rifle') {
      this.hitMode = 'sniper';
      this.hitReticle.style.opacity = '1';
      this.applyVisibility();
      return;
    }

    this.hitMode = 'weapon';
    this.root.classList.add('hit');
  }

  update(delta: number): void {
    if (!this.hitMode) return;

    this.hitElapsed += delta;
    const scale = this.sampleHitScale(this.hitElapsed);
    const pulseTransform = `rotate(45deg) scale(${scale})`;

    if (this.hitMode === 'sniper') {
      this.hitReticle.style.transform = pulseTransform;
    } else {
      this.weaponReticle.style.transform = pulseTransform;
    }

    if (this.hitElapsed >= HIT_PULSE_SEC) {
      this.resetHit();
    }
  }

  private applyRootTransform(): void {
    this.root.style.transform =
      `translate(calc(-50% + ${this.aimOffsetX}px), calc(-50% + ${this.aimOffsetY}px))`;
  }

  private sampleHitScale(elapsed: number): number {
    if (elapsed < HIT_ATTACK_SEC) {
      const t = elapsed / HIT_ATTACK_SEC;
      return 1 + t * HIT_SCALE_BOOST;
    }

    if (elapsed < HIT_ATTACK_SEC + HIT_HOLD_SEC) {
      return 1 + HIT_SCALE_BOOST;
    }

    const decayStart = HIT_ATTACK_SEC + HIT_HOLD_SEC;
    const decayT = (elapsed - decayStart) / (HIT_PULSE_SEC - decayStart);
    return 1 + HIT_SCALE_BOOST * (1 - decayT);
  }

  private resetHit(): void {
    this.hitElapsed = 0;
    this.hitMode = null;
    this.root.classList.remove('hit');
    this.weaponReticle.style.transform = '';
    this.hitReticle.style.transform = '';
    this.hitReticle.style.opacity = '0';
    this.applyVisibility();
  }
}
