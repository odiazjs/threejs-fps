import * as THREE from 'three';
import { createGrenadeMesh, disposeGrenadeObject } from '../content/grenadeModel';

/** First-person grenade hold pose (right / down / forward from camera). */
const BASE_POSITION = new THREE.Vector3(0.26, -0.28, -0.52);
const BASE_ROTATION = new THREE.Euler(0.35, 0.5, 0.2);
const VIEWMODEL_SCALE = 1;

const TAU = Math.PI * 2;

/** Throw follow-through + pull-a-new-one-from-belt timeline (seconds). */
const THROW_DURATION = 0.62;
const RELEASE_END = 0.2;
const EMPTY_END = 0.4;

/** Belt draw start offset (relative to base hold pose). */
const DRAW_FROM = {
  x: 0.12,
  y: -0.6,
  z: 0.16,
  rx: 1.15,
  ry: -0.35,
  rz: 0.45,
};

/** Throw release follow-through peak offset (relative to base hold pose). */
const RELEASE_TO = {
  x: -0.07,
  y: 0.15,
  z: -0.24,
  rx: -0.75,
  ry: 0.42,
  rz: -0.22,
};

const SWAY_BLEND_SPEED = 12;

const _pos = new THREE.Vector3();
const _rot = new THREE.Euler();

function easeOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

interface ThrowDrawPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  meshVisible: boolean;
}

/** Offsets (added to the base hold pose) for the throw → redraw animation. */
function sampleThrowDraw(t: number): ThrowDrawPose {
  if (t < RELEASE_END) {
    const e = easeOutCubic(t / RELEASE_END);
    return {
      x: RELEASE_TO.x * e,
      y: RELEASE_TO.y * e,
      z: RELEASE_TO.z * e,
      rx: RELEASE_TO.rx * e,
      ry: RELEASE_TO.ry * e,
      rz: RELEASE_TO.rz * e,
      meshVisible: true,
    };
  }

  if (t < EMPTY_END) {
    // Grenade has left the hand — empty while reaching for the belt.
    return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, meshVisible: false };
  }

  const k = (t - EMPTY_END) / (1 - EMPTY_END);
  const inv = 1 - easeOutBack(k);
  return {
    x: DRAW_FROM.x * inv,
    y: DRAW_FROM.y * inv,
    z: DRAW_FROM.z * inv,
    rx: DRAW_FROM.rx * inv,
    ry: DRAW_FROM.ry * inv,
    rz: DRAW_FROM.rz * inv,
    meshVisible: true,
  };
}

/**
 * Held grenade preview shown at the hip position while a throwable is equipped.
 * Handles idle/walk sway plus a throw-and-redraw animation on release.
 */
export class GrenadeViewModel {
  private rig: THREE.Group | null = null;
  private mesh: THREE.Group | null = null;
  private loading = false;
  private wantVisible = false;
  private animTime = -1;
  private swayPhase = 0;
  private walkBlend = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  setVisible(visible: boolean): void {
    this.wantVisible = visible;
    if (visible) {
      this.ensureLoaded();
    } else {
      this.animTime = -1;
    }
    if (this.rig) {
      this.rig.visible = visible;
      if (this.mesh) this.mesh.visible = true;
    }
  }

  /** Play the release follow-through and pull a fresh grenade from the belt. */
  triggerThrow(): void {
    if (!this.wantVisible) return;
    this.animTime = 0;
  }

  update(delta: number, walking: boolean, sprinting: boolean, grounded: boolean): void {
    if (!this.rig || !this.wantVisible) return;

    const walkActive = grounded && (walking || sprinting);
    this.walkBlend += ((walkActive ? 1 : 0) - this.walkBlend) * (1 - Math.exp(-SWAY_BLEND_SPEED * delta));
    const freq = 0.42 + this.walkBlend * (sprinting ? 1.9 : 1.1);
    this.swayPhase += delta * freq;

    _pos.copy(BASE_POSITION);
    _rot.copy(BASE_ROTATION);

    let meshVisible = true;
    if (this.animTime >= 0) {
      this.animTime += delta;
      const t = this.animTime / THROW_DURATION;
      if (t >= 1) {
        this.animTime = -1;
      } else {
        const pose = sampleThrowDraw(t);
        _pos.x += pose.x;
        _pos.y += pose.y;
        _pos.z += pose.z;
        _rot.x += pose.rx;
        _rot.y += pose.ry;
        _rot.z += pose.rz;
        meshVisible = pose.meshVisible;
      }
    }

    const posAmp = 0.002 + this.walkBlend * 0.0045;
    const rotAmp = 0.0028 + this.walkBlend * 0.006;
    const s = this.swayPhase * TAU;
    _pos.x += Math.sin(s) * posAmp + Math.sin(s * 0.48 + 0.9) * posAmp * 0.3;
    _pos.y += Math.cos(s * 1.12) * posAmp * 0.75;
    _pos.z += Math.sin(s * 0.61 + 1.35) * posAmp * 0.35;
    _rot.x += Math.sin(s * 0.53 + 0.4) * rotAmp * 0.35;
    _rot.y += Math.cos(s * 0.37) * rotAmp * 0.3;
    _rot.z += Math.sin(s * 0.88) * rotAmp;

    this.rig.position.copy(_pos);
    this.rig.rotation.copy(_rot);
    if (this.mesh) this.mesh.visible = meshVisible;
  }

  dispose(): void {
    if (this.rig) {
      disposeGrenadeObject(this.rig);
      this.rig.removeFromParent();
    }
    this.rig = null;
    this.mesh = null;
  }

  private ensureLoaded(): void {
    if (this.rig || this.loading) return;

    this.loading = true;
    void createGrenadeMesh()
      .then((mesh) => {
        this.loading = false;

        const rig = new THREE.Group();
        rig.name = 'grenade-viewmodel';
        rig.add(mesh);
        rig.position.copy(BASE_POSITION);
        rig.rotation.copy(BASE_ROTATION);
        rig.scale.setScalar(VIEWMODEL_SCALE);
        rig.renderOrder = 20;
        rig.visible = this.wantVisible;
        rig.traverse((child) => {
          child.frustumCulled = false;
        });

        this.camera.add(rig);
        this.rig = rig;
        this.mesh = mesh;
      })
      .catch(() => {
        this.loading = false;
      });
  }
}
