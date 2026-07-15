import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import { TEAM_COLORS } from '../../shared/combat/teams';
import type { RemotePlayerUiVisibilityState } from './remotePlayerUiVisibility';

const FALLBACK_TOP_OFFSET = 1.84;
const REF_DISTANCE = 12;
const MIN_SCALE = 0.38;
const MAX_SCALE = 1;
const SCREEN_LIFT_PX = 4;
/** Extra world-space lift above the head when the camera is far away. */
const FAR_WORLD_LIFT_MAX = 0.72;
const FAR_WORLD_LIFT_START = 10;
const FAR_WORLD_LIFT_RANGE = 36;
/** Extra screen-space lift so the bar clears small distant silhouettes. */
const FAR_SCREEN_LIFT_MAX = 42;

const ENEMY_COLOR = '#ff5a4e';

const _anchor = new THREE.Vector3();

export class RemoteHealthBar {
  readonly object: CSS2DObject;
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly shieldTrack: HTMLDivElement;
  private readonly shieldFill: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private topOffset = FALLBACK_TOP_OFFSET;
  private alive = false;
  private nameVisible = false;
  private healthBarVisible = false;
  private shieldAvailable = false;
  private isEnemy = false;
  private teamId = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'remote-health-bar';

    this.name = document.createElement('div');
    this.name.className = 'remote-health-bar-name';

    this.shieldTrack = document.createElement('div');
    this.shieldTrack.className = 'remote-health-bar-shield-track';

    this.shieldFill = document.createElement('div');
    this.shieldFill.className = 'remote-health-bar-shield-fill';
    this.shieldTrack.appendChild(this.shieldFill);

    this.track = document.createElement('div');
    this.track.className = 'remote-health-bar-track';

    this.fill = document.createElement('div');
    this.fill.className = 'remote-health-bar-fill';
    this.track.appendChild(this.fill);
    this.root.append(this.name, this.shieldTrack, this.track);

    this.object = new CSS2DObject(this.root);
    this.object.position.y = this.topOffset;
    this.object.visible = false;
    this.applyVisibility();
  }

  setHeadTopOffset(offset: number): void {
    this.topOffset = Math.max(1.4, offset);
    this.object.position.y = this.topOffset;
  }

  update(
    hp: number,
    alive: boolean,
    teamId: number,
    username: string,
    shieldPoints = 0,
    shieldCapacity = 0,
  ): void {
    this.alive = alive;
    this.teamId = teamId;

    const ratio = Math.max(0, Math.min(1, hp / PLAYER_MAX_HP));
    this.fill.style.width = `${ratio * 100}%`;

    this.shieldAvailable = shieldCapacity > 0;
    const shieldRatio = this.shieldAvailable
      ? Math.max(0, Math.min(1, shieldPoints / shieldCapacity))
      : 0;
    this.shieldFill.style.width = `${shieldRatio * 100}%`;

    this.name.textContent = username;
    this.applyColors();
    this.applyVisibility();
  }

  /** Enemies get the red glow treatment: name and HP fill both go red. */
  setEnemyStyle(isEnemy: boolean): void {
    if (this.isEnemy === isEnemy) return;
    this.isEnemy = isEnemy;
    this.root.classList.toggle('enemy', isEnemy);
    this.applyColors();
  }

  private applyColors(): void {
    const teamColor = TEAM_COLORS[this.teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
    const color = this.isEnemy ? ENEMY_COLOR : teamColor;
    this.fill.style.background = `linear-gradient(90deg, ${color}, ${color}cc)`;
    this.name.style.color = color;
  }

  setVisibility(visibility: RemotePlayerUiVisibilityState): void {
    this.nameVisible = visibility.nameVisible;
    this.healthBarVisible = visibility.healthBarVisible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const show = this.alive && (this.nameVisible || this.healthBarVisible);
    this.object.visible = show;
    this.name.hidden = !this.nameVisible;
    this.track.hidden = !this.healthBarVisible;
    this.shieldTrack.hidden = !this.healthBarVisible || !this.shieldAvailable;
    this.root.classList.toggle('name-only', this.nameVisible && !this.healthBarVisible);
    this.root.classList.toggle('health-only', this.healthBarVisible && !this.nameVisible);
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
