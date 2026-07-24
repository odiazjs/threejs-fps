import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  DEFAULT_FP_ARMS_GRIP,
  type FpArmsGripConfig,
} from '../../shared/content/weaponConfig';
import { getActiveCharacterId } from '../content/activeCharacterMesh';
import { applyMeshyCharacterMaterial } from '../content/meshyCharacterMaterial';

const ASSET_BASE = '/3d/';
/** Default rifle idle (any non-pistol gun). */
export const FP_ARMS_RIFLE_IDLE_FILE = 'fps_arms/meshy_fps_arms_rifle_idle.fbx';
/** Pistol idle while pistol is equipped. */
export const FP_ARMS_PISTOL_IDLE_FILE = 'fps_arms/character_fps_arms_pistol_idle.fbx';
/** One-shot pistol fire clip. */
export const FP_ARMS_PISTOL_SHOT_FILE = 'fps_arms/character_fps_arms_pistol_shot.fbx';
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
const SHOT_FADE_SEC = 0.06;
const SKIN_WEIGHT_WARNING = 'more than 4 skinning weights';

export type FpArmsStance = 'rifle' | 'pistol';
type ArmsAnimMode = 'idle' | 'reload' | 'sprint' | 'pistolShot';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _gripPos = new THREE.Vector3();

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
 * Reloading/sprint: hierarchy inverts — arms under camera, weapon under RightHand.
 */
export class FpArmsViewModel {
  /** Attach point — reparented onto each active weapon mesh (or camera while reloading). */
  private readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private rifleIdleAction: THREE.AnimationAction | null = null;
  private pistolIdleAction: THREE.AnimationAction | null = null;
  private pistolShotAction: THREE.AnimationAction | null = null;
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
  private stance: FpArmsStance = 'rifle';
  private animMode: ArmsAnimMode = 'idle';
  private wantReloading = false;
  private wantSprinting = false;
  private wantReloadDurationSec = 1;
  private wantReloadLoop = false;
  private readonly onMixerFinished = (event: { action: THREE.AnimationAction }): void => {
    if (event.action === this.pistolShotAction && this.animMode === 'pistolShot') {
      this.animMode = 'idle';
      this.applyAnimState(true);
    }
  };
  private readonly loadPromise: Promise<void>;

  constructor() {
    this.root.name = 'fpArmsViewModel';
    this.loadPromise = this.load();
  }

  private async load(): Promise<void> {
    try {
      const loader = new FBXLoader();
      loader.setResourcePath(`${ASSET_BASE}fps_arms/`);

      const [rifleIdleFbx, pistolIdleFbx, pistolShotFbx, reloadFbx, sprintFbx] =
        await Promise.all([
          loadFbx(loader, assetUrl(FP_ARMS_RIFLE_IDLE_FILE)),
          loadFbx(loader, assetUrl(FP_ARMS_PISTOL_IDLE_FILE)),
          loadFbx(loader, assetUrl(FP_ARMS_PISTOL_SHOT_FILE)),
          loadFbx(loader, assetUrl(FP_ARMS_RELOAD_FILE)),
          loadFbx(loader, assetUrl(FP_ARMS_SPRINT_FILE)),
        ]);
      if (this.disposed) return;

      const rifleIdleClip = pickClip(rifleIdleFbx.animations, /idle|rifle|aim|equip|default/i);
      const pistolIdleClip = pickClip(pistolIdleFbx.animations, /idle|pistol|aim|equip|default/i);
      const pistolShotClip = pickClip(pistolShotFbx.animations, /shot|fire|shoot|attack/i);
      const reloadClip = pickClip(reloadFbx.animations, /reload|mag|clip/i);
      const sprintClip = pickClip(sprintFbx.animations, /sprint|run|jog/i);

      this.mixer = new THREE.AnimationMixer(rifleIdleFbx);
      this.mixer.addEventListener('finished', this.onMixerFinished);

      if (rifleIdleClip) {
        this.rifleIdleAction = this.mixer.clipAction(rifleIdleClip);
        this.rifleIdleAction.setLoop(THREE.LoopRepeat, Infinity);
        this.rifleIdleAction.play();
      } else {
        console.warn('[FpArmsViewModel] No idle clip in', FP_ARMS_RIFLE_IDLE_FILE);
      }

      if (pistolIdleClip) {
        this.pistolIdleAction = this.mixer.clipAction(pistolIdleClip);
        this.pistolIdleAction.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        console.warn('[FpArmsViewModel] No idle clip in', FP_ARMS_PISTOL_IDLE_FILE);
      }

      if (pistolShotClip) {
        this.pistolShotAction = this.mixer.clipAction(pistolShotClip);
        this.pistolShotAction.setLoop(THREE.LoopOnce, 1);
        this.pistolShotAction.clampWhenFinished = true;
      } else {
        console.warn('[FpArmsViewModel] No shot clip in', FP_ARMS_PISTOL_SHOT_FILE);
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

      rifleIdleFbx.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.frustumCulled = false;
          child.renderOrder = 10;
        }
      });

      this.worldFitScale = prepareFpArmsContent(rifleIdleFbx);
      this.rightHand =
        findBoneBySuffix(rifleIdleFbx, 'RightHand') ??
        findBoneBySuffix(rifleIdleFbx, 'Hand_R');
      if (!this.rightHand) {
        console.warn('[FpArmsViewModel] No RightHand bone — reload weapon bind disabled');
      }

      await applyMeshyCharacterMaterial(rifleIdleFbx, getActiveCharacterId());
      if (this.disposed) return;

      this.meshRoot = rifleIdleFbx;
      this.root.add(rifleIdleFbx);
      this.ready = true;
      this.root.visible = this.visible;
      this.animMode = 'idle';
      this.applyAnimState(true);
    } catch (error) {
      console.warn('[FpArmsViewModel] failed to load arms', error);
    }
  }

  isWeaponBoundToHand(): boolean {
    return this.handBoundWeapon != null;
  }

  /** Switch rifle vs pistol idle set (does not interrupt reload/sprint). */
  setStance(stance: FpArmsStance): void {
    if (this.stance === stance) return;
    this.stance = stance;
    if (this.animMode === 'pistolShot' && stance !== 'pistol') {
      this.animMode = 'idle';
    }
    if (this.animMode === 'idle' || this.animMode === 'pistolShot') {
      this.applyAnimState(true);
    }
  }

  /**
   * Drive reload / idle clips. `durationSec` scales the reload clip to match
   * magazine (or per-shell) reload time. Reload overrides sprint / shot.
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

  /** Play pistol fire one-shot (ignored while reloading / sprinting / non-pistol). */
  playPistolShot(): void {
    if (!this.ready || this.disposed) return;
    if (this.stance !== 'pistol' || !this.pistolShotAction) return;
    if (this.wantReloading || this.wantSprinting) return;

    const prev = this.animMode;
    this.animMode = 'pistolShot';
    this.fadeOutMode(prev, SHOT_FADE_SEC);
    this.pistolShotAction.reset();
    this.pistolShotAction.setEffectiveWeight(1);
    this.pistolShotAction.fadeIn(SHOT_FADE_SEC);
    this.pistolShotAction.play();
  }

  private getIdleAction(): THREE.AnimationAction | null {
    if (this.stance === 'pistol') {
      return this.pistolIdleAction ?? this.rifleIdleAction;
    }
    return this.rifleIdleAction;
  }

  private desiredAnimMode(): ArmsAnimMode {
    if (this.wantReloading) return 'reload';
    if (this.wantSprinting) return 'sprint';
    if (this.animMode === 'pistolShot') return 'pistolShot';
    return 'idle';
  }

  private fadeOutMode(mode: ArmsAnimMode, fadeSec = FADE_SEC): void {
    if (mode === 'reload') this.reloadAction?.fadeOut(fadeSec);
    else if (mode === 'sprint') this.sprintAction?.fadeOut(fadeSec);
    else if (mode === 'pistolShot') this.pistolShotAction?.fadeOut(fadeSec);
    else {
      this.rifleIdleAction?.fadeOut(fadeSec);
      this.pistolIdleAction?.fadeOut(fadeSec);
    }
  }

  private applyAnimState(force = false): void {
    if (!this.ready || this.disposed) return;
    const next = this.desiredAnimMode();
    if (!force && next === this.animMode) return;
    if (!this.mixer || !this.rifleIdleAction) return;

    const prev = this.animMode;

    // Resolve to a playable mode if the preferred clip is missing.
    let play: ArmsAnimMode = next;
    if (play === 'reload' && !this.reloadAction) {
      play = this.wantSprinting && this.sprintAction ? 'sprint' : 'idle';
    }
    if (play === 'sprint' && !this.sprintAction) {
      play = 'idle';
    }
    if (play === 'pistolShot' && !this.pistolShotAction) {
      play = 'idle';
    }

    this.animMode = play;
    this.fadeOutMode(prev);

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

    if (play === 'pistolShot' && this.pistolShotAction) {
      this.pistolShotAction.reset();
      this.pistolShotAction.setEffectiveWeight(1);
      this.pistolShotAction.fadeIn(SHOT_FADE_SEC);
      this.pistolShotAction.play();
      return;
    }

    const idle = this.getIdleAction();
    if (!idle) return;
    idle.reset();
    idle.setEffectiveWeight(1);
    idle.fadeIn(FADE_SEC);
    idle.play();
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
   * `adsBlend` lerps {@link FpArmsGripConfig.hip} → {@link FpArmsGripConfig.ads}.
   */
  syncToWeapon(
    weaponMesh: THREE.Object3D | null,
    grip: FpArmsGripConfig = DEFAULT_FP_ARMS_GRIP,
    adsBlend = 0,
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
    const t = THREE.MathUtils.clamp(adsBlend, 0, 1);
    _gripPos.set(
      THREE.MathUtils.lerp(grip.hip.x, grip.ads.x, t),
      THREE.MathUtils.lerp(grip.hip.y, grip.ads.y, t),
      THREE.MathUtils.lerp(grip.hip.z, grip.ads.z, t),
    );
    this.root.position.copy(_gripPos);
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
      this.handBoundWeapon.removeFromParent();
      this.handBoundWeapon = null;
    }
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this.onMixerFinished);
      this.mixer.stopAllAction();
    }
    this.mixer = null;
    this.rifleIdleAction = null;
    this.pistolIdleAction = null;
    this.pistolShotAction = null;
    this.reloadAction = null;
    this.sprintAction = null;
    this.meshRoot?.removeFromParent();
    this.meshRoot = null;
    this.rightHand = null;
    this.root.removeFromParent();
    this.attachedWeapon = null;
  }
}
