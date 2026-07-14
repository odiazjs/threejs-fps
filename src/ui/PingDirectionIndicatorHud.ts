import * as THREE from 'three';
import { computeDamageIndicatorAngle } from '../combat/damageIndicatorMath';
import { TEAM_PING_TTL_SEC } from '../../shared/network/ping';
import type { ActivePingInfo } from './TeamPingIndicators';

const MARKER_RADIUS_VMIN = 30;
const FADE_OUT_SEC = 0.4;
/** NDC half-extent treated as "on screen" — slightly inside the edge so the
 * arrow appears just before the decal fully leaves the view. */
const ON_SCREEN_NDC = 0.95;

const _viewPos = new THREE.Vector3();

const ARROW_SVG = `<svg class="ping-direction-arrow-icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 1 L31 29 L16 23 L1 29 Z" />
</svg>`;

interface PingDirectionMarker {
  element: HTMLElement;
  arrow: HTMLElement;
  distanceLabel: HTMLElement;
  worldPos: THREE.Vector3;
}

/**
 * Radial arrows around the crosshair pointing toward teammates' pings, with a
 * live distance readout — mirrors the grenade threat indicator layout.
 */
export class PingDirectionIndicatorHud {
  private readonly root: HTMLElement;
  private readonly markersRoot: HTMLElement;
  private readonly markers = new Map<string, PingDirectionMarker>();

  constructor() {
    this.root = document.getElementById('ping-direction-hud')!;
    this.markersRoot = this.root.querySelector('.ping-direction-markers')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.clear();
    }
  }

  sync(
    camera: THREE.Camera | null,
    pings: readonly ActivePingInfo[],
    localSessionId: string,
    localPosition: THREE.Vector3 | null,
  ): void {
    const activeIds = new Set<string>();

    for (const ping of pings) {
      // Only point at teammates' pings — your own decal needs no direction hint.
      if (ping.pingerId === '' || ping.pingerId === localSessionId) continue;
      activeIds.add(ping.id);

      let marker = this.markers.get(ping.id);
      if (!marker) {
        const element = document.createElement('div');
        element.className = 'ping-direction-marker';

        const arrow = document.createElement('div');
        arrow.className = 'ping-direction-arrow';
        arrow.innerHTML = ARROW_SVG;

        const distanceLabel = document.createElement('div');
        distanceLabel.className = 'ping-direction-distance';

        element.append(arrow, distanceLabel);
        this.markersRoot.appendChild(element);

        marker = {
          element,
          arrow,
          distanceLabel,
          worldPos: new THREE.Vector3(),
        };
        this.markers.set(ping.id, marker);
      }

      marker.worldPos.set(ping.x, ping.y, ping.z);

      if (localPosition) {
        const distance = Math.round(marker.worldPos.distanceTo(localPosition));
        marker.distanceLabel.textContent = `${distance}m`;
      }

      const fadeOutStart = TEAM_PING_TTL_SEC - FADE_OUT_SEC;
      const fade =
        ping.age > fadeOutStart ? 1 - (ping.age - fadeOutStart) / FADE_OUT_SEC : 1;
      marker.element.style.opacity = String(Math.max(0, fade));
    }

    for (const [id, marker] of this.markers) {
      if (activeIds.has(id)) continue;
      marker.element.remove();
      this.markers.delete(id);
    }

    if (!camera) return;

    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    for (const marker of this.markers.values()) {
      // The decal itself is visible while on screen — only guide the eye
      // toward pings outside the current view.
      if (this.isOnScreen(camera, marker.worldPos)) {
        marker.element.style.display = 'none';
        continue;
      }
      marker.element.style.display = '';

      const angle = computeDamageIndicatorAngle(camera, marker.worldPos);
      this.applyMarkerLayout(marker, angle);
    }
  }

  private isOnScreen(camera: THREE.Camera, worldPos: THREE.Vector3): boolean {
    _viewPos.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
    if (_viewPos.z >= 0) return false; // behind the camera

    _viewPos.copy(worldPos).project(camera);
    return (
      Math.abs(_viewPos.x) <= ON_SCREEN_NDC && Math.abs(_viewPos.y) <= ON_SCREEN_NDC
    );
  }

  private applyMarkerLayout(marker: PingDirectionMarker, angle: number): void {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const angleDeg = (angle * 180) / Math.PI;

    // The container stays upright so the distance label is readable — only
    // the arrow glyph rotates toward the ping.
    marker.element.style.left = `calc(50% + ${sin * MARKER_RADIUS_VMIN}vmin)`;
    marker.element.style.top = `calc(50% - ${cos * MARKER_RADIUS_VMIN}vmin)`;
    marker.element.style.transform = 'translate(-50%, -50%)';
    marker.arrow.style.transform = `rotate(${angleDeg}deg)`;
  }

  private clear(): void {
    for (const marker of this.markers.values()) {
      marker.element.remove();
    }
    this.markers.clear();
    this.markersRoot.replaceChildren();
  }
}
