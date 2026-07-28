import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { TEAM_COLORS } from '../../shared/combat/teams';

const FALLBACK_TOP_OFFSET = 2.05;
const REF_DISTANCE = 14;
const MIN_SCALE = 0.42;
const MAX_SCALE = 1.15;

const _anchor = new THREE.Vector3();

/**
 * CSS2D chevron above a teammate's head — points down so you can spot them
 * through clutter. Colored with the shared team palette (blue / orange).
 */
export class TeammateSpotMarker {
  readonly object: CSS2DObject;
  private readonly root: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private topOffset = FALLBACK_TOP_OFFSET;
  private visible = false;
  private teamId = 0;
  private lastTransform = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'teammate-spot';

    this.arrow = document.createElement('div');
    this.arrow.className = 'teammate-spot-arrow';
    this.root.appendChild(this.arrow);

    this.object = new CSS2DObject(this.root);
    this.object.position.y = this.topOffset;
    this.object.visible = false;
    this.object.renderOrder = 980;
    this.applyColor();
  }

  setHeadTopOffset(offset: number): void {
    this.topOffset = Math.max(1.55, offset + 0.22);
    this.object.position.y = this.topOffset;
  }

  setTeamId(teamId: number): void {
    if (this.teamId === teamId) return;
    this.teamId = teamId;
    this.applyColor();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.object.visible = visible;
  }

  private applyColor(): void {
    const color = TEAM_COLORS[this.teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
    this.root.style.setProperty('--teammate-spot-color', color);
  }

  updateLayout(camera: THREE.Camera): void {
    if (!this.object.visible) return;

    this.object.position.y = this.topOffset;
    this.object.getWorldPosition(_anchor);
    const dist = Math.max(camera.position.distanceTo(_anchor), REF_DISTANCE * 0.35);
    const scale = THREE.MathUtils.clamp(REF_DISTANCE / dist, MIN_SCALE, MAX_SCALE);
    const transform = `translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    if (transform !== this.lastTransform) {
      this.lastTransform = transform;
      this.root.style.transformOrigin = '50% 100%';
      this.root.style.transform = transform;
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    this.root.remove();
  }
}
