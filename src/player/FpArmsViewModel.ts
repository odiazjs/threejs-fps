import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  DEFAULT_FP_ARMS_GRIP,
  type WeaponViewOffset,
} from '../../shared/content/weaponConfig';
import { getActiveCharacterId } from '../content/activeCharacterMesh';
import { applyMeshyCharacterMaterial } from '../content/meshyCharacterMaterial';

const ASSET_BASE = '/3d/';
/** Blender FPS arms rig with embedded rifle-idle clip (used for any equipped gun/melee). */
export const FP_ARMS_RIFLE_IDLE_FILE = 'fps_arms/meshy_fps_arms_rifle_idle.fbx';
/** Reload clip — played on the idle arms skeleton when the local weapon reloads. */
export const FP_ARMS_RELOAD_FILE = 'fps_arms/character_fps_arms_reloading.fbx';
/** Sprint clip — looping while sprinting with a weapon equipped. */
export const FP_ARMS_SPRINT_FILE = 'fps_arms/character_fps_arms_sprinting.fbx';

/** Max bbox axis length in world meters after fit. */
const TARGET_EXTENT = 0.55 * 1.1;
/**
 * Arms FBX faces +Z. Guns use LOCAL_GUN_WEAPON_ROTATION (Y=-90°) so barrel is
 * mesh +X → camera -Z. As a weapon child, yaw +90° so arms forward matches barrel.
 */
const MODEL_YAW = Math.PI / 2;

const FADE_SEC = 0.12;
const SKIN_WEIGHT_WARNING = 'more than 4 skinning weights';

type ArmsAnimMode = 'idle' | 'reload' | 'sprint';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function assetUrl(file: string): string {
  return `${ASSET_BASE}${file
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function pickClip(
  animations: THREE.AnimationClip[],
  prefer: RegExp,
): THREE.AnimationClip | null {
  if (animations.length === 0) return null;
  return animations.find((clip) => prefer.test(clip.name)) ?? animations[0] ?? null;
}

function findBoneBySuffix(root: THREE.Object3D, suffix: string): THREE.Object3D | null {
  const target = suffix.toLowerCase();
  let exact: THREE.Object3D | null = null;
  let fallback: THREE.Object3D | null = null;

  root.traverse((child) => {
    if (child.type !== 'Bone') return;
    const name = child.name.replace(/^mixamorig:?/i, '').toLowerCase();
    if (!name.endsWith(target)) return;
    if (name === target) {
      exact = child;
      return;
    }
    if (!fallback) fallback = child;
  });

  return exact ?? fallback;
}

function loadFbx(loader: FBXLoader, url: string): Promise<THREE.Group> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes(SKIN_WEIGHT_WARNING)) return;
    originalWarn.apply(console, args as Parameters<typeof console.warn>);
  };

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        console.warn = originalWarn;
        resolve(object as THREE.Group);
      },
      undefined,
      (error) => {
        console.warn = originalWarn;
        reject(error);
      },
    );
  });
}

/**
 * Fit + center the arms content at local origin. World size is applied via the
 * attach root scale (compensates for weapon mesh 0.1 scale).
 */
function prepareFpArmsContent(model: THREE.Group): number {
  model.rotation.set(0, MODEL_YAW, 0);
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);

  _box.setFromObject(model);
  _box.getSize(_size);
  const maxDim = Math.max(_size.x, _size.y, _size.z, 0.001);
  const fitScale = TARGET_EXTENT / maxDim;
  model.scale.setScalar(fitScale);
  model.updateMatrixWorld(true);

  _box.setFromObject(model);
  _box.getCenter(_center);
  model.position.sub(_center);

  return fitScale;
}

/**
 * Local first-person arms viewmodel.
 *
 * Default: parented under the active weapon so hip/ADS/sway move gun + arms.
 * Reloading: hierarchy inverts — arms under camera, weapon under RightHand —
 * so the reload clip drives the gun.
 */
export class FpArmsViewModel {
  /** Attach point — reparented onto each active weapon mesh (or camera while reloading). */
  private readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private reloadAction: THREE.AnimationAction | null = null;
  private sprintAction: THREE.AnimationAction | null = null;
  private meshRoot: THREE.Group | null = null;
  private rightHand: THREE.Object3D | null = null;
  /** Weapon the arms are parented under (null while weapon is on the hand). */
  private attachedWeapon: THREE.Object3D | null = null;
  /** Weapon currently parented to the right-hand bone. */
  private handBoundWeapon: THREE.Object3D | null = null;
  private worldFitScale = 1;
  private disposed = false;
  private visible = true;
  private ready = false;
  private animMode: ArmsAnimMode = 'idle';
  private wantReloading = false;
  private wantSprinting = false;
  private wantReloadDurationSec = 1;
  private wantReloadLoop = false;
  private readonly loadPromise: Promise<void>;

  constructor() {
    this.root.name = 'fpArmsViewModel';
    this.loadPromise = this.load();
  }

  private async load(): Promise<void> {
    try {
      const loader = new FBXLoader();
      loader.setResourcePath(`${ASSET_BASE}fps_arms/`);

      const [idleFbx, reloadFbx, sprintFbx] = await Promise.all([
        loadFbx(loader, assetUrl(FP_ARMS_RIFLE_IDLE_FILE)),
        loadFbx(loader, assetUrl(FP_ARMS_RELOAD_FILE)),
        loadFbx(loader, assetUrl(FP_ARMS_SPRINT_FILE)),
      ]);
      if (this.disposed) return;

      const idleClip = pickClip(idleFbx.animations, /idle|rifle|aim|equip|default/i);
      const reloadClip = pickClip(reloadFbx.animations, /reload|mag|clip/i);
      const sprintClip = pickClip(sprintFbx.animations, /sprint|run|jog/i);

      this.mixer = new THREE.AnimationMixer(idleFbx);

      if (idleClip) {
        this.idleAction = this.mixer.clipAction(idleClip);
        this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
        this.idleAction.play();
      } else {
        console.warn('[FpArmsViewModel] No idle clip in', FP_ARMS_RIFLE_IDLE_FILE);
      }

      if (reloadClip) {
        this.reloadAction = this.mixer.clipAction(reloadClip);
        this.reloadAction.setLoop(THREE.LoopOnce, 1);
        this.reloadAction.clampWhenFinished = true;
      } else {
        console.warn('[FpArmsViewModel] No reload clip in', FP_ARMS_RELOAD_FILE);
      }

      if (sprintClip) {
        this.sprintAction = this.mixer.clipAction(sprintClip);
        this.sprintAction.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        console.warn('[FpArmsViewModel] No sprint clip in', FP_ARMS_SPRINT_FILE);
      }

      this.mixer.update(0);

      idleFbx.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.frustumCulled = false;
          child.renderOrder = 10;
        }
      });

      this.worldFitScale = prepareFpArmsContent(idleFbx);
      this.rightHand =
        findBoneBySuffix(idleFbx, 'RightHand') ?? findBoneBySuffix(idleFbx, 'Hand_R');
      if (!this.rightHand) {
        console.warn('[FpArmsViewModel] No RightHand bone — reload weapon bind disabled');
      }

      await applyMeshyCharacterMaterial(idleFbx, getActiveCharacterId());
      if (this.disposed) return;

      this.meshRoot = idleFbx;
      this.root.add(idleFbx);
      this.ready = true;
      this.root.visible = this.visible;
      // Apply any locomotion that started while assets were loading.
      this.animMode = 'idle';
      this.applyAnimState(true);
    } catch (error) {
      console.warn('[FpArmsViewModel] failed to load arms', error);
    }
  }

  isWeaponBoundToHand(): boolean {
    return this.handBoundWeapon != null;
  }

  /**
   * Drive reload / idle clips. `durationSec` scales the reload clip to match
   * magazine (or per-shell) reload time. Reload overrides sprint.
   */
  setReloading(reloading: boolean, durationSec = 1, loop = false): void {
    this.wantReloading = reloading;
    this.wantReloadDurationSec = durationSec;
    this.wantReloadLoop = loop;
    this.applyAnimState();
  }

  /** Loop sprint clip while sprinting with a weapon (ignored during reload). */
  setSprinting(sprinting: boolean): void {
    this.wantSprinting = sprinting;
    this.applyAnimState();
  }

  private desiredAnimMode(): ArmsAnimMode {
    if (this.wantReloading) return 'reload';
    if (this.wantSprinting) return 'sprint';
    return 'idle';
  }

  private applyAnimState(force = false): void {
    if (!this.ready || this.disposed) return;
    const next = this.desiredAnimMode();
    if (!force && next === this.animMode) return;
    if (!this.mixer || !this.idleAction) return;

    const prev = this.animMode;
    const fadeOutPrev = (): void => {
      if (prev === 'reload') this.reloadAction?.fadeOut(FADE_SEC);
      else if (prev === 'sprint') this.sprintAction?.fadeOut(FADE_SEC);
      else this.idleAction?.fadeOut(FADE_SEC);
    };

    // Resolve to a playable mode if the preferred clip is missing.
    let play: ArmsAnimMode = next;
    if (play === 'reload' && !this.reloadAction) {
      play = this.wantSprinting && this.sprintAction ? 'sprint' : 'idle';
    }
    if (play === 'sprint' && !this.sprintAction) {
      play = 'idle';
    }

    this.animMode = play;
    fadeOutPrev();

    if (play === 'reload' && this.reloadAction) {
      if (this.wantReloadLoop) {
        this.reloadAction.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        this.reloadAction.setLoop(THREE.LoopOnce, 1);
        this.reloadAction.clampWhenFinished = true;
      }
      this.syncReloadTimeScale(this.wantReloadDurationSec);
      this.reloadAction.reset();
      this.reloadAction.setEffectiveWeight(1);
      this.reloadAction.fadeIn(FADE_SEC);
      this.reloadAction.play();
      return;
    }

    if (play === 'sprint' && this.sprintAction) {
      this.sprintAction.reset();
      this.sprintAction.setEffectiveWeight(1);
      this.sprintAction.fadeIn(FADE_SEC);
      this.sprintAction.play();
      return;
    }

    this.idleAction.reset();
    this.idleAction.setEffectiveWeight(1);
    this.idleAction.fadeIn(FADE_SEC);
    this.idleAction.play();
  }

  private syncReloadTimeScale(durationSec: number): void {
    if (!this.reloadAction) return;
    const clipDur = Math.max(this.reloadAction.getClip().duration, 0.05);
    const target = Math.max(durationSec, 0.05);
    this.reloadAction.timeScale = clipDur / target;
  }

  /**
   * While reloading or sprinting: arms → camera, weapon → RightHand
   * (world transforms preserved). Otherwise restore weapon → camera.
   */
  syncWeaponHandBinding(
    weapon: THREE.Object3D | null,
    camera: THREE.Object3D,
    bindToHand: boolean,
  ): void {
    if (!this.ready || this.disposed) return;

    if (bindToHand && weapon && this.rightHand) {
      this.bindWeaponToHand(weapon, camera);
      return;
    }

    this.unbindWeaponFromHand(camera);
  }

  private bindWeaponToHand(weapon: THREE.Object3D, camera: THREE.Object3D): void {
    if (!this.rightHand) return;
    if (this.handBoundWeapon === weapon) return;

    if (this.handBoundWeapon && this.handBoundWeapon !== weapon) {
      this.unbindWeaponFromHand(camera);
    }

    // Break arms→weapon parenting first to avoid a cycle when weapon→hand.
    this.root.updateWorldMatrix(true, true);
    camera.attach(this.root);
    this.attachedWeapon = null;

    weapon.updateWorldMatrix(true, true);
    this.rightHand.attach(weapon);
    this.handBoundWeapon = weapon;
    this.root.visible = this.visible;
  }

  private unbindWeaponFromHand(camera: THREE.Object3D): void {
    if (!this.handBoundWeapon) return;

    const weapon = this.handBoundWeapon;
    weapon.updateWorldMatrix(true, true);
    camera.attach(weapon);
    this.handBoundWeapon = null;
  }

  /**
   * Keep arms parented to the active weapon (or detach when none / grenade).
   * No-ops while the weapon is bound to the right hand for reload.
   */
  syncToWeapon(
    weaponMesh: THREE.Object3D | null,
    gripOffset: WeaponViewOffset = DEFAULT_FP_ARMS_GRIP,
  ): void {
    if (!this.ready || this.disposed) return;

    if (this.handBoundWeapon) {
      this.root.visible = this.visible;
      return;
    }

    if (!weaponMesh || !this.visible) {
      if (this.attachedWeapon) {
        this.root.removeFromParent();
        this.attachedWeapon = null;
      }
      this.root.visible = false;
      return;
    }

    this.root.visible = true;

    if (this.attachedWeapon !== weaponMesh) {
      weaponMesh.add(this.root);
      this.attachedWeapon = weaponMesh;
    }

    // Weapon meshes use ~0.1 viewmodel scale — compensate so arms stay world-sized.
    const parentScale = Math.max(Math.abs(weaponMesh.scale.x), 1e-4);
    this.root.scale.setScalar(1 / parentScale);
    this.root.position.set(gripOffset.x, gripOffset.y, gripOffset.z);
    this.root.rotation.set(0, 0, 0);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.root.visible = false;
      return;
    }
    this.root.visible = this.attachedWeapon != null || this.handBoundWeapon != null;
  }

  update(delta: number): void {
    if (!this.visible) return;
    if (!this.attachedWeapon && !this.handBoundWeapon) return;
    this.mixer?.update(delta);
  }

  async refreshSkin(): Promise<void> {
    await this.loadPromise;
    if (this.disposed || !this.meshRoot) return;
    await applyMeshyCharacterMaterial(this.meshRoot, getActiveCharacterId());
  }

  dispose(): void {
    this.disposed = true;
    if (this.handBoundWeapon) {
      // Detach without a camera host — parent may already be tearing down.
      this.handBoundWeapon.removeFromParent();
      this.handBoundWeapon = null;
    }
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.idleAction = null;
    this.reloadAction = null;
    this.sprintAction = null;
    this.meshRoot?.removeFromParent();
    this.meshRoot = null;
    this.rightHand = null;
    this.root.removeFromParent();
    this.attachedWeapon = null;
  }
}
