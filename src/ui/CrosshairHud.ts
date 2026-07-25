import type { WeaponId } from '../../shared/content/weaponIds';

const HIT_PULSE_SEC = 0.38;
const HIT_ATTACK_SEC = 0.045;
const HIT_HOLD_SEC = 0.12;
const HIT_SCALE_BOOST = 0.75;

/** Hip reticle arm gap (px from rest) — idle / walk / sprint. */
const SPREAD_IDLE_PX = 0;
const SPREAD_WALK_PX = 5;
const SPREAD_SPRINT_PX = 11;
/** Exponential approach rate for spread tween (higher = snappier). */
const SPREAD_LERP_SPEED = 10;

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
  /** Global ADS style: centered neon cyan circle for every weapon. */
  private adsActive = false;
  /** Sniper scope lens draws its own reticle — hide the HUD center dot. */
  private hideAdsDot = false;
  private moving = false;
  private sprinting = false;
  private spreadPx = 0;
  private targetSpreadPx = 0;

  constructor() {
    this.root = document.getElementById('crosshair')!;
    this.referenceRoot = document.getElementById('crosshair-reference')!;
    this.hitRoot = document.getElementById('crosshair-hit')!;
    this.weaponReticle = this.root.querySelector('.crosshair-reticle')!;
    this.hitReticle = this.hitRoot.querySelector('.crosshair-reticle')!;
    this.applyRootTransform();
    this.applySpreadCss();
    this.applyVisibility();
  }

  setVisible(visible: boolean): void {
    this.playVisible = visible;
    this.applyVisibility();
    if (!visible) {
      this.resetHit();
      this.setAimOffset(0, 0);
      this.spreadPx = 0;
      this.targetSpreadPx = 0;
      this.applySpreadCss();
    }
  }

  /**
   * When true, hip 4-line reticle is replaced by a screen-centered neon cyan
   * circle. Scope-lens weapons pass `hideCenterDot` so only the optic reticle shows.
   */
  setAdsActive(ads: boolean, options?: { hideCenterDot?: boolean }): void {
    const hideCenterDot = options?.hideCenterDot === true;
    if (this.adsActive === ads && this.hideAdsDot === hideCenterDot) return;
    this.adsActive = ads;
    this.hideAdsDot = hideCenterDot;
    this.root.classList.toggle('ads', ads);
    this.root.classList.toggle('ads-scope-lens', ads && hideCenterDot);
    this.syncSpreadTarget();
    this.applyVisibility();
  }

  /** Drive hip-fire arm separation from locomotion (tweened in {@link update}). */
  setMovementSpread(moving: boolean, sprinting: boolean): void {
    this.moving = moving;
    this.sprinting = sprinting;
    this.syncSpreadTarget();
  }

  private syncSpreadTarget(): void {
    if (this.adsActive || !this.playVisible) {
      this.targetSpreadPx = SPREAD_IDLE_PX;
      return;
    }
    if (this.sprinting) {
      this.targetSpreadPx = SPREAD_SPRINT_PX;
    } else if (this.moving) {
      this.targetSpreadPx = SPREAD_WALK_PX;
    } else {
      this.targetSpreadPx = SPREAD_IDLE_PX;
    }
  }

  private applyVisibility(): void {
    const crosshairDisplay = this.playVisible ? 'block' : 'none';
    this.root.style.display = crosshairDisplay;
    // Soft reference pip is hip-only — ADS uses the neon circle.
    this.referenceRoot.style.display = this.playVisible && !this.adsActive ? 'block' : 'none';
    const hitDisplay =
      this.playVisible && (!this.adsActive || this.hitMode != null) ? 'block' : 'none';
    this.hitRoot.style.display = hitDisplay;
  }

  setAimOffset(x: number, y: number): void {
    this.aimOffsetX = x;
    this.aimOffsetY = y;
    this.applyRootTransform();
  }

  onHit(weaponId: WeaponId): void {
    this.hitElapsed = 0;

    // ADS / sniper: pulse the dedicated hit reticle (hip lines are hidden in ADS).
    if (this.adsActive || weaponId === 'sniper_rifle') {
      this.hitMode = 'sniper';
      this.hitReticle.style.opacity = '1';
      this.applyVisibility();
      return;
    }

    this.hitMode = 'weapon';
    this.root.classList.add('hit');
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    if (dt > 0) {
      const t = 1 - Math.exp(-SPREAD_LERP_SPEED * dt);
      this.spreadPx += (this.targetSpreadPx - this.spreadPx) * t;
      if (Math.abs(this.targetSpreadPx - this.spreadPx) < 0.05) {
        this.spreadPx = this.targetSpreadPx;
      }
      this.applySpreadCss();
    }

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

  private applySpreadCss(): void {
    this.weaponReticle.style.setProperty('--spread', `${this.spreadPx.toFixed(2)}px`);
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
