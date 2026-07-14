import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { TEAM_PING_TTL_SEC } from '../../shared/network/ping';

const FADE_OUT_SEC = 0.4;
const POP_IN_SEC = 0.12;

export interface ActivePingInfo {
  id: string;
  pingerId: string;
  x: number;
  y: number;
  z: number;
  age: number;
}

interface ActivePing extends ActivePingInfo {
  object: CSS2DObject;
  root: HTMLDivElement;
  distanceLabel: HTMLDivElement;
}

/**
 * World-anchored team ping decals (neon cyan triangle + live distance in
 * meters), rendered like damage numbers via CSS2D. Each ping lives for
 * TEAM_PING_TTL_SEC; any number can be active at once.
 */
export class TeamPingIndicators {
  readonly group = new THREE.Group();
  private readonly pings: ActivePing[] = [];
  private idCounter = 0;

  constructor() {
    this.group.name = 'team-pings';
  }

  spawn(x: number, y: number, z: number, pingerId = ''): void {
    const root = document.createElement('div');
    root.className = 'team-ping';

    const triangle = document.createElement('div');
    triangle.className = 'team-ping-triangle';

    const distanceLabel = document.createElement('div');
    distanceLabel.className = 'team-ping-distance';

    root.append(triangle, distanceLabel);

    const object = new CSS2DObject(root);
    object.position.set(x, y, z);
    object.renderOrder = 999;
    this.group.add(object);

    this.pings.push({
      id: `ping-${++this.idCounter}`,
      pingerId,
      object,
      root,
      distanceLabel,
      x,
      y,
      z,
      age: 0,
    });
  }

  update(delta: number, localPosition: THREE.Vector3 | null): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i]!;
      ping.age += delta;

      if (ping.age >= TEAM_PING_TTL_SEC) {
        this.remove(i);
        continue;
      }

      if (localPosition) {
        const distance = Math.round(
          Math.hypot(
            ping.x - localPosition.x,
            ping.y - localPosition.y,
            ping.z - localPosition.z,
          ),
        );
        ping.distanceLabel.textContent = `${distance}m`;
      }

      const popIn = Math.min(1, ping.age / POP_IN_SEC);
      const fadeOutStart = TEAM_PING_TTL_SEC - FADE_OUT_SEC;
      const fadeOut =
        ping.age > fadeOutStart ? 1 - (ping.age - fadeOutStart) / FADE_OUT_SEC : 1;
      ping.root.style.opacity = String(popIn * fadeOut);
    }
  }

  /** XZ positions of live pings for the minimap / tactical map. */
  getMinimapPings(): Array<{ x: number; z: number }> {
    return this.pings.map((ping) => ({ x: ping.x, z: ping.z }));
  }

  /** Live pings for the first-person direction indicator HUD. */
  getActivePings(): readonly ActivePingInfo[] {
    return this.pings;
  }

  clear(): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.remove(i);
    }
  }

  private remove(index: number): void {
    const ping = this.pings[index]!;
    ping.object.removeFromParent();
    ping.root.remove();
    this.pings.splice(index, 1);
  }
}
