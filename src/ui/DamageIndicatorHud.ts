const INDICATOR_LIFETIME_SEC = 1.35;
const VIGNETTE_DECAY_PER_SEC = 2.8;
const MAX_MARKERS = 8;
const MARKER_RADIUS_VMIN = 46;

interface DamageMarker {
  element: HTMLElement;
  bearing: number;
  remaining: number;
  intensity: number;
}

export class DamageIndicatorHud {
  private readonly root: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly markersRoot: HTMLElement;
  private vignetteStrength = 0;
  private markers: DamageMarker[] = [];

  constructor() {
    this.root = document.getElementById('damage-indicator-hud')!;
    this.vignette = this.root.querySelector('.damage-vignette')!;
    this.markersRoot = this.root.querySelector('.damage-markers')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.clear();
    }
  }

  onDamage(amount: number, bearing: number | null): void {
    const normalized = Math.min(1, amount / 35);
    this.vignetteStrength = Math.min(1, this.vignetteStrength + 0.35 + normalized * 0.55);

    if (bearing === null) return;

    const intensity = 0.55 + normalized * 0.45;
    const existing = this.markers.find(
      (marker) => Math.abs(marker.bearing - bearing) < 0.28,
    );

    if (existing) {
      existing.remaining = INDICATOR_LIFETIME_SEC;
      existing.intensity = Math.min(1, existing.intensity + intensity * 0.45);
      existing.bearing = bearing;
      this.applyMarkerTransform(existing);
      return;
    }

    const element = document.createElement('div');
    element.className = 'damage-direction-marker';
    this.markersRoot.appendChild(element);

    const marker: DamageMarker = {
      element,
      bearing,
      remaining: INDICATOR_LIFETIME_SEC,
      intensity,
    };
    this.applyMarkerTransform(marker);
    this.markers.push(marker);

    if (this.markers.length > MAX_MARKERS) {
      const oldest = this.markers.shift()!;
      oldest.element.remove();
    }
  }

  update(delta: number): void {
    if (this.vignetteStrength > 0) {
      this.vignetteStrength = Math.max(
        0,
        this.vignetteStrength - VIGNETTE_DECAY_PER_SEC * delta,
      );
      this.vignette.style.opacity = `${this.vignetteStrength}`;
    }

    const before = this.markers.length;
    this.markers = this.markers.filter((marker) => {
      marker.remaining -= delta;
      if (marker.remaining <= 0) {
        marker.element.remove();
        return false;
      }

      const fade = marker.remaining / INDICATOR_LIFETIME_SEC;
      const opacity = marker.intensity * Math.pow(fade, 0.65);
      marker.element.style.opacity = `${opacity}`;
      return true;
    });

    if (before !== this.markers.length && this.markers.length === 0) {
      this.markersRoot.replaceChildren();
    }
  }

  private applyMarkerTransform(marker: DamageMarker): void {
    const bearingDeg = (marker.bearing * 180) / Math.PI;
    marker.element.style.transform =
      `rotate(${bearingDeg}deg) translateY(-${MARKER_RADIUS_VMIN}vmin) rotate(180deg)`;
    marker.element.style.opacity = `${marker.intensity}`;
  }

  private clear(): void {
    this.vignetteStrength = 0;
    this.vignette.style.opacity = '0';
    this.markers = [];
    this.markersRoot.replaceChildren();
  }
}
