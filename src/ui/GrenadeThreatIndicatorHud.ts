import * as THREE from 'three';
import { computeDamageIndicatorAngle } from '../combat/damageIndicatorMath';
import type { NearbyGrenadeThreat } from '../combat/grenadeThreatIndicator';

const MARKER_RADIUS_VMIN = 38;

const ARROW_SVG = `<svg class="grenade-threat-arrow-icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 1 L31 29 L16 23 L1 29 Z" />
</svg>`;

interface GrenadeMarker {
  element: HTMLElement;
  worldPos: THREE.Vector3;
  proximity: number;
}

export class GrenadeThreatIndicatorHud {
  private readonly root: HTMLElement;
  private readonly markersRoot: HTMLElement;
  private readonly markers = new Map<string, GrenadeMarker>();

  constructor() {
    this.root = document.getElementById('grenade-threat-hud')!;
    this.markersRoot = this.root.querySelector('.grenade-threat-markers')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.clear();
    }
  }

  sync(camera: THREE.Camera | null, nearbyGrenades: readonly NearbyGrenadeThreat[]): void {
    const activeIds = new Set<string>();

    for (const grenade of nearbyGrenades) {
      activeIds.add(grenade.id);

      let marker = this.markers.get(grenade.id);
      if (!marker) {
        const element = document.createElement('div');
        element.className = 'grenade-threat-marker';
        element.innerHTML = ARROW_SVG;
        this.markersRoot.appendChild(element);
        marker = {
          element,
          worldPos: new THREE.Vector3(),
          proximity: 0,
        };
        this.markers.set(grenade.id, marker);
      }

      marker.worldPos.set(grenade.x, grenade.y, grenade.z);
      marker.proximity = grenade.proximity;
    }

    for (const [id, marker] of this.markers) {
      if (activeIds.has(id)) continue;
      marker.element.remove();
      this.markers.delete(id);
    }

    if (!camera) return;

    for (const marker of this.markers.values()) {
      const angle = computeDamageIndicatorAngle(camera, marker.worldPos);
      this.applyMarkerLayout(marker, angle);
    }
  }

  private applyMarkerLayout(marker: GrenadeMarker, angle: number): void {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const angleDeg = (angle * 180) / Math.PI;
    const scale = 1.1 + marker.proximity * 0.5;

    marker.element.style.left = `calc(50% + ${sin * MARKER_RADIUS_VMIN}vmin)`;
    marker.element.style.top = `calc(50% - ${cos * MARKER_RADIUS_VMIN}vmin)`;
    marker.element.style.transform =
      `translate(-50%, -50%) rotate(${angleDeg}deg) scale(${scale})`;
    marker.element.style.opacity = `${0.82 + marker.proximity * 0.18}`;
  }

  private clear(): void {
    for (const marker of this.markers.values()) {
      marker.element.remove();
    }
    this.markers.clear();
    this.markersRoot.replaceChildren();
  }
}
