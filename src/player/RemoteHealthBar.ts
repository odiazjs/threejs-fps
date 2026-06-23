import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import { HEAD_SIZE } from './RemoteAvatar';

/** Local Y above lookRig origin (head top + gap). */
const CLEARANCE_ABOVE_HEAD = 0.5;
const REF_DISTANCE = 12;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.15;
const BASE_MARGIN_PX = 18;
const MIN_CLEARANCE_ABOVE_HEAD = 0.32;
const MAX_CLEARANCE_ABOVE_HEAD = 0.62;
const MIN_SCREEN_MARGIN_PX = 10;
const MAX_SCREEN_MARGIN_PX = 26;

const TEAM_COLORS = ['#6a9fd4', '#e5a088'] as const;

const _anchor = new THREE.Vector3();

export class RemoteHealthBar {
  readonly object: CSS2DObject;
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly fill: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'remote-health-bar';

    this.name = document.createElement('div');
    this.name.className = 'remote-health-bar-name';

    const track = document.createElement('div');
    track.className = 'remote-health-bar-track';

    this.fill = document.createElement('div');
    this.fill.className = 'remote-health-bar-fill';
    track.appendChild(this.fill);
    this.root.append(this.name, track);

    this.object = new CSS2DObject(this.root);
    this.object.position.y = HEAD_SIZE / 2 + CLEARANCE_ABOVE_HEAD;
  }

  update(hp: number, alive: boolean, teamId: number, username: string): void {
    this.object.visible = alive;

    const ratio = Math.max(0, Math.min(1, hp / PLAYER_MAX_HP));
    this.fill.style.width = `${ratio * 100}%`;

    const color = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
    this.fill.style.background = `linear-gradient(90deg, ${color}, ${color}cc)`;
    this.name.textContent = username;
    this.name.style.color = color;
  }

  /** Keep screen size and bottom gap proportional to camera distance. */
  updateLayout(camera: THREE.Camera): void {
    this.object.getWorldPosition(_anchor);
    const dist = camera.position.distanceTo(_anchor);
    const scale = THREE.MathUtils.clamp(dist / REF_DISTANCE, MIN_SCALE, MAX_SCALE);

    const clearance = THREE.MathUtils.clamp(
      CLEARANCE_ABOVE_HEAD + (scale - 1) * 0.35,
      MIN_CLEARANCE_ABOVE_HEAD,
      MAX_CLEARANCE_ABOVE_HEAD,
    );
    this.object.position.y = HEAD_SIZE / 2 + clearance;

    const labelHeight = this.root.offsetHeight || 36;
    const margin = THREE.MathUtils.clamp(
      (BASE_MARGIN_PX + labelHeight * 0.2) * scale,
      MIN_SCREEN_MARGIN_PX,
      MAX_SCREEN_MARGIN_PX,
    );

    this.root.style.transformOrigin = '50% 100%';
    this.root.style.transform =
      `translate(-50%, -100%) translateY(-${margin}px) scale(${scale})`;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.root.remove();
  }
}
