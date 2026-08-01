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
  private readonly scopeVignette: HTMLElement | null;
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
  /** Sniper optic ADS: enlarged thin screen-center cross instead of the circle. */
  private opticCross = false;
  /** Hide all reticle art (sniper ADS enter/exit before pose settles). */
  private suppressReticle = false;
  /** Pixel size of the optic cross (matches projected scope end ring). */
  private opticCrossSizePx = 256;
  private moving = false;
  private sprinting = false;
  private spreadPx = 0;
  private targetSpreadPx = 0;

  constructor() {
    this.root = document.getElementById('crosshair')!;
    this.referenceRoot = document.getElementById('crosshair-reference')!;
    this.hitRoot = document.getElementById('crosshair-hit')!;
    this.scopeVignette = document.getElementById('scope-vignette');
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
   * circle — unless `opticCross`, which keeps an enlarged thin cross instead.
   * `suppress` hides all reticle art (used while sniper ADS is still blending).
   */
  setAdsActive(
    ads: boolean,
    options?: { opticCross?: boolean; suppress?: boolean },
  ): void {
    const opticCross = options?.opticCross === true;
    const suppress = options?.suppress === true;
    if (
      this.adsActive === ads &&
      this.opticCross === opticCross &&
      this.suppressReticle === suppress
    ) {
      return;
    }
    this.adsActive = ads;
    this.opticCross = opticCross;
    this.suppressReticle = suppress;
    this.root.classList.toggle('ads', ads);
    this.root.classList.toggle('ads-optic-cross', ads && opticCross);
    this.root.classList.toggle('ads-suppress', suppress);
    if (!opticCross || !ads) {
      this.root.style.removeProperty('width');
      this.root.style.removeProperty('height');
    } else {
      this.applyOpticCrossSize();
    }
    this.syncSpreadTarget();
    this.applyVisibility();
  }

  /**
   * Size the sniper ADS cross to the projected `sniper_sight_01.end` diameter
   * so the arms span the visible eye-ring like a lens reticle.
   */
  setOpticCrossSizePx(sizePx: number): void {
    const next = Math.max(48, Math.min(sizePx, 2400));
    if (Math.abs(next - this.opticCrossSizePx) < 0.5) return;
    this.opticCrossSizePx = next;
    if (this.adsActive && this.opticCross) {
      this.applyOpticCrossSize();
    }
  }

  private applyOpticCrossSize(): void {
    const px = `${this.opticCrossSizePx.toFixed(1)}px`;
    this.root.style.width = px;
    this.root.style.height = px;
    this.applyScopeVignette();
  }

  /** Circular black vignette around the sniper optic cross (same center + radius). */
  private applyScopeVignette(): void {
    if (!this.scopeVignette) return;
    const active =
      this.playVisible && this.adsActive && this.opticCross && !this.suppressReticle;
    this.scopeVignette.classList.toggle('visible', active);
    if (!active) return;

    const radiusPx = this.opticCrossSizePx * 0.5;
    this.scopeVignette.style.setProperty(
      '--scope-x',
      `calc(50% + ${this.aimOffsetX.toFixed(2)}px)`,
    );
    this.scopeVignette.style.setProperty(
      '--scope-y',
      `calc(50% + ${this.aimOffsetY.toFixed(2)}px)`,
    );
    this.scopeVignette.style.setProperty('--scope-r', `${radiusPx.toFixed(1)}px`);
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
    // Soft reference pip is hip-only — ADS / sniper blend suppress hide it.
    this.referenceRoot.style.display =
      this.playVisible && !this.adsActive && !this.suppressReticle ? 'block' : 'none';
    const hitDisplay =
      this.playVisible &&
      !this.suppressReticle &&
      (!this.adsActive || this.hitMode != null)
        ? 'block'
        : 'none';
    this.hitRoot.style.display = hitDisplay;
    this.applyScopeVignette();
  }

  setAimOffset(x: number, y: number): void {
    this.aimOffsetX = x;
    this.aimOffsetY = y;
    this.applyRootTransform();
    this.applyScopeVignette();
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
