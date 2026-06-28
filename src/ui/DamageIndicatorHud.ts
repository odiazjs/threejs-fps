import * as THREE from 'three';
import { computeDamageIndicatorAngle } from '../combat/damageIndicatorMath';

const INDICATOR_LIFETIME_SEC = 1.35;
const VIGNETTE_DECAY_PER_SEC = 2.8;
const SHIELD_BREAK_FLASH_SEC = 0.95;
const MAX_MARKERS = 8;
const MARKER_RADIUS_VMIN = 44;

const ARROW_SVG = `<svg class="damage-arrow-icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 3 L28 27 L16 21 L4 27 Z" />
</svg>`;

export type DamageIndicatorKind = 'health' | 'shield';

interface DamageMarker {
  element: HTMLElement;
  shooterWorldPos: THREE.Vector3;
  remaining: number;
  intensity: number;
  kind: DamageIndicatorKind;
}

export class DamageIndicatorHud {
  private readonly root: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly shieldBreakFlash: HTMLElement;
  private readonly markersRoot: HTMLElement;
  private vignetteStrength = 0;
  private vignetteKind: DamageIndicatorKind = 'health';
  private shieldBreakRemaining = 0;
  private markers: DamageMarker[] = [];

  constructor() {
    this.root = document.getElementById('damage-indicator-hud')!;
    this.vignette = this.root.querySelector('.damage-vignette')!;
    this.shieldBreakFlash = this.root.querySelector('.shield-break-flash')!;
    this.markersRoot = this.root.querySelector('.damage-markers')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.clear();
    }
  }

  onDamage(
    amount: number,
    shooterWorldPos: THREE.Vector3 | null,
    camera: THREE.Camera | null | undefined,
    kind: DamageIndicatorKind = 'health',
  ): void {
    const normalized = Math.min(1, amount / 35);
    const boost = kind === 'shield' ? 0.42 : 0.35;
    const strengthGain = boost + normalized * (kind === 'shield' ? 0.5 : 0.55);

    if (kind === 'shield' || this.vignetteStrength <= 0) {
      this.vignetteKind = kind;
    }

    this.vignetteStrength = Math.min(1, this.vignetteStrength + strengthGain);
    this.root.classList.toggle('shield-hit', this.vignetteKind === 'shield');
    this.root.classList.toggle('health-hit', this.vignetteKind === 'health');

    if (!shooterWorldPos) return;

    const intensity = 0.55 + normalized * 0.45;

    const element = document.createElement('div');
    element.className = 'damage-direction-marker';
    if (kind === 'shield') {
      element.classList.add('shield-marker');
    }
    element.innerHTML = ARROW_SVG;
    this.markersRoot.appendChild(element);

    const marker: DamageMarker = {
      element,
      shooterWorldPos: shooterWorldPos.clone(),
      remaining: INDICATOR_LIFETIME_SEC,
      intensity,
      kind,
    };
    element.style.opacity = `${intensity}`;
    this.markers.push(marker);

    if (camera) {
      this.applyMarkerLayout(
        marker,
        computeDamageIndicatorAngle(camera, marker.shooterWorldPos),
      );
    }

    if (this.markers.length > MAX_MARKERS) {
      const oldest = this.markers.shift()!;
      oldest.element.remove();
    }
  }

  onShieldBroken(
    shooterWorldPos: THREE.Vector3 | null,
    camera: THREE.Camera | null | undefined,
  ): void {
    this.shieldBreakRemaining = SHIELD_BREAK_FLASH_SEC;
    this.root.classList.add('shield-broken');
    this.root.classList.remove('shield-hit');
    this.vignetteKind = 'health';
    this.vignetteStrength = Math.min(1, this.vignetteStrength + 0.72);

    if (shooterWorldPos && camera) {
      this.onDamage(1, shooterWorldPos, camera, 'health');
    }
  }

  update(delta: number, camera: THREE.Camera | null): void {
    if (this.shieldBreakRemaining > 0) {
      this.shieldBreakRemaining = Math.max(0, this.shieldBreakRemaining - delta);
      const t = this.shieldBreakRemaining / SHIELD_BREAK_FLASH_SEC;
      this.shieldBreakFlash.style.opacity = `${Math.pow(t, 0.55) * 0.95}`;
      if (this.shieldBreakRemaining <= 0) {
        this.root.classList.remove('shield-broken');
        this.shieldBreakFlash.style.opacity = '0';
      }
    }

    if (this.vignetteStrength > 0) {
      this.vignetteStrength = Math.max(
        0,
        this.vignetteStrength - VIGNETTE_DECAY_PER_SEC * delta,
      );
      this.vignette.style.opacity = `${this.vignetteStrength}`;
      if (this.vignetteStrength <= 0) {
        this.root.classList.remove('shield-hit', 'health-hit');
      }
    }

    const before = this.markers.length;
    this.markers = this.markers.filter((marker) => {
      marker.remaining -= delta;
      if (marker.remaining <= 0) {
        marker.element.remove();
        return false;
      }

      if (camera) {
        const angle = computeDamageIndicatorAngle(camera, marker.shooterWorldPos);
        this.applyMarkerLayout(marker, angle);
      }

      const fade = marker.remaining / INDICATOR_LIFETIME_SEC;
      marker.element.style.opacity = `${marker.intensity * Math.pow(fade, 0.65)}`;
      return true;
    });

    if (before !== this.markers.length && this.markers.length === 0) {
      this.markersRoot.replaceChildren();
    }
  }

  private applyMarkerLayout(marker: DamageMarker, angle: number): void {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const angleDeg = (angle * 180) / Math.PI;

    marker.element.style.left = `calc(50% + ${sin * MARKER_RADIUS_VMIN}vmin)`;
    marker.element.style.top = `calc(50% - ${cos * MARKER_RADIUS_VMIN}vmin)`;
    marker.element.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
  }

  private clear(): void {
    this.vignetteStrength = 0;
    this.vignette.style.opacity = '0';
    this.shieldBreakRemaining = 0;
    this.shieldBreakFlash.style.opacity = '0';
    this.root.classList.remove('shield-hit', 'health-hit', 'shield-broken');
    this.markers = [];
    this.markersRoot.replaceChildren();
  }
}
