import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';

const LIFETIME_SEC = 1.5;
const MAX_FLOAT_PX = 28;
const FLOAT_PX_PER_SEC = 18;
const MAX_HORIZONTAL_OFFSET_PX = 52;
const BASE_VERTICAL_OFFSET_PX = 16;
const REF_DISTANCE = 12;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.5;
const TEXT_SIZE_BIAS = 1.35;
const BUMP_DECAY = 6;

const DAMAGE_COLOR_LOW = 0xffe08a;
const DAMAGE_COLOR_MID = 0xff8820;
const DAMAGE_COLOR_HIGH = 0xff3838;

const _anchor = new THREE.Vector3();
const _color = new THREE.Color();
const _colorMid = new THREE.Color(DAMAGE_COLOR_MID);
const _colorHigh = new THREE.Color(DAMAGE_COLOR_HIGH);

function damageColor(total: number): string {
  const t = Math.min(1, total / PLAYER_MAX_HP);
  if (t <= 0.5) {
    _color.setHex(DAMAGE_COLOR_LOW).lerp(_colorMid, t * 2);
  } else {
    _color.setHex(DAMAGE_COLOR_MID).lerp(_colorHigh, (t - 0.5) * 2);
  }
  return `#${_color.getHexString()}`;
}

export class DamageNumberStack {
  readonly object: CSS2DObject;
  private readonly root: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private total = 0;
  private age = LIFETIME_SEC;
  private bump = 0;
  private layoutScale = 1;
  private offsetX = 0;
  private headTopOffset = 0.22;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'damage-number-stack';

    this.label = document.createElement('div');
    this.label.className = 'damage-number';
    this.root.appendChild(this.label);

    this.object = new CSS2DObject(this.root);
    this.object.position.y = this.headTopOffset;
    this.object.renderOrder = 1000;
    this.root.style.zIndex = '1000';
    this.object.visible = false;
  }

  push(amount: number): void {
    const damage = Math.floor(amount);
    if (damage <= 0) return;

    const wasInactive = this.age >= LIFETIME_SEC || !this.object.visible;
    if (wasInactive) {
      this.offsetX = (Math.random() - 0.5) * 2 * MAX_HORIZONTAL_OFFSET_PX;
    }

    this.total += damage;
    this.label.textContent = String(Math.floor(this.total));
    this.applyDamageColor();
    this.age = 0;
    this.bump = 1;
    this.object.visible = true;
  }

  clear(): void {
    this.total = 0;
    this.age = LIFETIME_SEC;
    this.bump = 0;
    this.offsetX = 0;
    this.label.textContent = '';
    this.label.style.opacity = '0';
    this.object.visible = false;
  }

  setHeadTopOffset(offset: number): void {
    this.headTopOffset = Math.max(0.12, offset);
    this.object.position.y = this.headTopOffset;
  }

  update(delta: number, camera: THREE.Camera): void {
    this.updateLayout(camera);

    if (this.age >= LIFETIME_SEC) {
      this.object.visible = false;
      return;
    }

    this.age += delta;
    this.bump = Math.max(0, this.bump - delta * BUMP_DECAY);

    if (this.age >= LIFETIME_SEC) {
      this.clear();
      return;
    }

    const fadeIn = Math.min(1, this.age / 0.05);
    const fadeOutStart = LIFETIME_SEC - 0.35;
    const fadeOut =
      this.age > fadeOutStart ? 1 - (this.age - fadeOutStart) / (LIFETIME_SEC - fadeOutStart) : 1;
    const opacity = fadeIn * fadeOut;

    const bumpScale = 1 + this.bump * 0.14;
    const scale = this.layoutScale * bumpScale;
    const offsetX = this.offsetX * this.layoutScale;
    const baseY = -BASE_VERTICAL_OFFSET_PX * this.layoutScale;
    const floatY = baseY - Math.min(this.age * FLOAT_PX_PER_SEC, MAX_FLOAT_PX) * this.layoutScale;

    this.label.style.opacity = String(opacity);
    this.label.style.transform =
      `translate(-50%, -50%) translate(${offsetX}px, ${floatY}px) scale(${scale})`;
  }

  private applyDamageColor(): void {
    const color = damageColor(this.total);
    this.label.style.color = color;
    this.label.style.textShadow = `
      0 0 8px ${color}88,
      0 1px 3px rgba(0, 0, 0, 0.95),
      0 2px 8px rgba(0, 0, 0, 0.65)`;
  }

  private updateLayout(camera: THREE.Camera): void {
    this.object.getWorldPosition(_anchor);
    const dist = Math.max(camera.position.distanceTo(_anchor), REF_DISTANCE * 0.35);
    this.layoutScale =
      THREE.MathUtils.clamp(REF_DISTANCE / dist, MIN_SCALE, MAX_SCALE) * TEXT_SIZE_BIAS;
  }

  dispose(): void {
    this.clear();
    this.object.removeFromParent();
    this.root.remove();
  }
}
