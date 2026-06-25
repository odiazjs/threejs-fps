import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';

const FALLBACK_TOP_OFFSET = 1.84;
const REF_DISTANCE = 12;
const MIN_SCALE = 0.38;
const MAX_SCALE = 1;
const SCREEN_LIFT_PX = 10;
/** Extra world-space lift above the head when the camera is far away. */
const FAR_WORLD_LIFT_MAX = 0.72;
const FAR_WORLD_LIFT_START = 10;
const FAR_WORLD_LIFT_RANGE = 36;
/** Extra screen-space lift so the bar clears small distant silhouettes. */
const FAR_SCREEN_LIFT_MAX = 42;

const TEAM_COLORS = ['#6a9fd4', '#e5a088'] as const;

const _anchor = new THREE.Vector3();

export class RemoteHealthBar {
  readonly object: CSS2DObject;
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private topOffset = FALLBACK_TOP_OFFSET;

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
    this.object.position.y = this.topOffset;
  }

  setHeadTopOffset(offset: number): void {
    this.topOffset = Math.max(1.5, offset);
    this.object.position.y = this.topOffset;
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

  updateLayout(camera: THREE.Camera): void {
    this.object.position.y = this.topOffset;
    this.object.getWorldPosition(_anchor);
    const dist = Math.max(camera.position.distanceTo(_anchor), REF_DISTANCE * 0.35);
    const farT = THREE.MathUtils.clamp(
      (dist - FAR_WORLD_LIFT_START) / FAR_WORLD_LIFT_RANGE,
      0,
      1,
    );
    const extraWorldLift = farT * FAR_WORLD_LIFT_MAX;
    this.object.position.y = this.topOffset + extraWorldLift;

    const scale = THREE.MathUtils.clamp(REF_DISTANCE / dist, MIN_SCALE, MAX_SCALE);
    const screenLift = SCREEN_LIFT_PX + farT * FAR_SCREEN_LIFT_MAX;

    this.root.style.transformOrigin = '50% 100%';
    this.root.style.transform =
      `translate(-50%, -100%) translateY(-${screenLift}px) scale(${scale})`;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.root.remove();
  }
}
