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
/**
 * Static pistol arms pose (idle + shooting). No clip — improved hand placement.
 */
export const FP_ARMS_PISTOL_IDLE_FILE = 'fps_arms/arms_pistol_1_no_weapon.fbx';
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

export type FpArmsStance = 'rifle' | 'pistol';
type ArmsAnimMode = 'idle' | 'reload' | 'sprint';

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

function prepareArmsMesh(model: THREE.Group): void {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
      child.renderOrder = 10;
    }
  });
  prepareFpArmsContent(model);
}

/**
 * Local first-person arms viewmodel.
 *
 * Default: parented under the active weapon so hip/ADS/sway move gun + arms.
 * Reloading/sprint: hierarchy inverts — arms under camera, weapon under RightHand.
 *
 * Pistol idle/shoot uses a static improved-hands mesh; sprint/reload still use
 * clips on the rifle arms skeleton.
 */
export class FpArmsViewModel {
  /** Attach point — reparented onto each active weapon mesh (or camera while reloading). */
  private readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private rifleIdleAction: THREE.AnimationAction | null = null;
  private reloadAction: THREE.AnimationAction | null = null;
  private sprintAction: THREE.AnimationAction | null = null;
  /** Animated rifle arms (also used for pistol sprint / reload). */
  private rifleMeshRoot: THREE.Group | null = null;
  /** Static pistol arms pose (idle + shooting). */
  private pistolMeshRoot: THREE.Group | null = null;
  private rightHand: THREE.Object3D | null = null;
  /** Weapon the arms are parented under (null while weapon is on the hand). */
  private attachedWeapon: THREE.Object3D | null = null;
  /** Weapon currently parented to the right-hand bone. */
  private handBoundWeapon: THREE.Object3D | null = null;
  private disposed = false;
  private visible = true;
  private ready = false;
  private stance: FpArmsStance = 'rifle';
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

      const [rifleIdleFbx, pistolIdleFbx, reloadFbx, sprintFbx] = await Promise.all([
        loadFbx(loader, assetUrl(FP_ARMS_RIFLE_IDLE_FILE)),
        loadFbx(loader, assetUrl(FP_ARMS_PISTOL_IDLE_FILE)),
        loadFbx(loader, assetUrl(FP_ARMS_RELOAD_FILE)),
        loadFbx(loader, assetUrl(FP_ARMS_SPRINT_FILE)),
      ]);
      if (this.disposed) return;

      const rifleIdleClip = pickClip(rifleIdleFbx.animations, /idle|rifle|aim|equip|default/i);
      const reloadClip = pickClip(reloadFbx.animations, /reload|mag|clip/i);
      const sprintClip = pickClip(sprintFbx.animations, /sprint|run|jog/i);

      this.mixer = new THREE.AnimationMixer(rifleIdleFbx);

      if (rifleIdleClip) {
        this.rifleIdleAction = this.mixer.clipAction(rifleIdleClip);
        this.rifleIdleAction.setLoop(THREE.LoopRepeat, Infinity);
        this.rifleIdleAction.play();
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

      prepareArmsMesh(rifleIdleFbx);
      prepareArmsMesh(pistolIdleFbx);

      this.rightHand =
        findBoneBySuffix(rifleIdleFbx, 'RightHand') ??
        findBoneBySuffix(rifleIdleFbx, 'Hand_R');
      if (!this.rightHand) {
        console.warn('[FpArmsViewModel] No RightHand bone — reload weapon bind disabled');
      }

      const skinId = getActiveCharacterId();
      await Promise.all([
        applyMeshyCharacterMaterial(rifleIdleFbx, skinId),
        applyMeshyCharacterMaterial(pistolIdleFbx, skinId),
      ]);
      if (this.disposed) return;

      this.rifleMeshRoot = rifleIdleFbx;
      this.pistolMeshRoot = pistolIdleFbx;
      this.root.add(rifleIdleFbx);
      this.root.add(pistolIdleFbx);
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
    if (this.animMode === 'idle') {
      this.applyAnimState(true);
    } else {
      this.syncMeshVisibility();
    }
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

  /** Pistol idle uses a static mesh — no fire one-shot. */
  playPistolShot(): void {
    // Intentionally no-op: pistol idle/shoot share the static arms pose.
  }

  /** Static pistol mesh for idle/shoot; animated rifle mesh for sprint/reload. */
  private usePistolMesh(): boolean {
    return this.stance === 'pistol' && this.animMode === 'idle';
  }

  private syncMeshVisibility(): void {
    const pistol = this.usePistolMesh();
    if (this.rifleMeshRoot) this.rifleMeshRoot.visible = !pistol;
    if (this.pistolMeshRoot) this.pistolMeshRoot.visible = pistol;
  }

  private desiredAnimMode(): ArmsAnimMode {
    if (this.wantReloading) return 'reload';
    if (this.wantSprinting) return 'sprint';
    return 'idle';
  }

  private fadeOutMode(mode: ArmsAnimMode, fadeSec = FADE_SEC): void {
    if (mode === 'reload') this.reloadAction?.fadeOut(fadeSec);
    else if (mode === 'sprint') this.sprintAction?.fadeOut(fadeSec);
    else this.rifleIdleAction?.fadeOut(fadeSec);
  }

  /** Keep rifle idle evaluated even while the static pistol mesh is shown. */
  private ensureRifleIdlePlaying(fadeIn: boolean): void {
    if (!this.rifleIdleAction) return;
    if (this.rifleIdleAction.isRunning()) {
      this.rifleIdleAction.setEffectiveWeight(1);
      return;
    }
    this.rifleIdleAction.reset();
    this.rifleIdleAction.setEffectiveWeight(1);
    if (fadeIn) this.rifleIdleAction.fadeIn(FADE_SEC);
    this.rifleIdleAction.play();
  }

  private applyAnimState(force = false): void {
    if (!this.ready || this.disposed) return;
    const next = this.desiredAnimMode();
    if (!force && next === this.animMode) {
      this.syncMeshVisibility();
      return;
    }
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

    // Warm the rifle idle pose before crossfading into sprint/reload. Pistol idle
    // shows a different mesh, but hand-bind still needs a valid rifle skeleton.
    if ((play === 'sprint' || play === 'reload') && prev === 'idle') {
      this.ensureRifleIdlePlaying(false);
      this.mixer.update(0);
    }

    this.animMode = play;
    this.fadeOutMode(prev);
    // Swap meshes before sprint/reload so hand-bind preserves the rifle arms pose.
    this.syncMeshVisibility();

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

    // Pistol idle/shoot: show the static mesh, but keep rifle idle running hidden
    // so sprint/reload can crossfade from a valid FPS pose like other weapons.
    if (this.stance === 'pistol') {
      this.ensureRifleIdlePlaying(prev !== 'idle');
      this.syncMeshVisibility();
      return;
    }

    this.ensureRifleIdlePlaying(true);
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
    if (!this.rightHand || !this.mixer) return;
    if (this.handBoundWeapon === weapon) return;

    if (this.handBoundWeapon && this.handBoundWeapon !== weapon) {
      this.unbindWeaponFromHand(camera);
    }

    // Same path for every weapon: rifle sprint/reload skeleton must be visible so
    // world-preserving attach keeps arms in view and the gun follows RightHand.
    if (this.rifleMeshRoot) this.rifleMeshRoot.visible = true;
    if (this.pistolMeshRoot) this.pistolMeshRoot.visible = false;

    // Evaluate the current clip pose before attach so pistol→sprint doesn't bind
    // against a stale/bind-pose skeleton from the hidden-mesh idle period.
    this.mixer.update(0);
    this.rifleMeshRoot?.updateWorldMatrix(true, true);

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
    // Keep the rifle skeleton warm even while the static pistol mesh is shown,
    // so pistol → sprint hand-bind always has valid bone matrices.
    this.mixer?.update(delta);
  }

  async refreshSkin(): Promise<void> {
    await this.loadPromise;
    if (this.disposed) return;
    const skinId = getActiveCharacterId();
    const jobs: Promise<void>[] = [];
    if (this.rifleMeshRoot) {
      jobs.push(applyMeshyCharacterMaterial(this.rifleMeshRoot, skinId));
    }
    if (this.pistolMeshRoot) {
      jobs.push(applyMeshyCharacterMaterial(this.pistolMeshRoot, skinId));
    }
    await Promise.all(jobs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.handBoundWeapon) {
      this.handBoundWeapon.removeFromParent();
      this.handBoundWeapon = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.mixer = null;
    this.rifleIdleAction = null;
    this.reloadAction = null;
    this.sprintAction = null;
    this.rifleMeshRoot?.removeFromParent();
    this.pistolMeshRoot?.removeFromParent();
    this.rifleMeshRoot = null;
    this.pistolMeshRoot = null;
    this.rightHand = null;
    this.root.removeFromParent();
    this.attachedWeapon = null;
  }
}
