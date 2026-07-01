import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WeaponId } from '../../shared/content/weaponIds';
import { MELEE_WEAPON_ID } from '../../shared/content/weaponIds';

const ASSET_BASE = '/3d/';
const TARGET_HEIGHT = 1.65;
/** Mixamo / FBX models usually face +Z; game forward is -Z. */
const MODEL_YAW = Math.PI;

export const CHARACTER_MODEL_FILES = {
  lobby: 'Rifle Idle Texture.fbx',
  rifleAimingIdle: 'Rifle Aiming Idle.fbx',
  pistolIdle: 'Pistol Idle.fbx',
  rifleRunShoot: 'Running Shoot Rifle.fbx',
  pistolRun: 'Pistol Run.fbx',
  rifleWalking: 'Rifle Walking.fbx',
  pistolWalk: 'Pistol Walk.fbx',
  rifleJump: 'Rifle Jump.fbx',
  pistolJump: 'Pistol Jump.fbx',
  reloadIdle: 'Reload Idle.fbx',
  reloadWalk: 'Reload Walk.fbx',
  reloadSprint: 'Reload Sprint.fbx',
  meleeIdle: 'Standing Idle Melee.fbx',
  meleeAttack: 'Standing Melee Attack Horizontal 100.fbx',
  weaponEquip: 'Unarmed Equip Over Shoulder.fbx',
} as const;

const ONE_SHOT_MODEL_FILES = new Set<string>([
  CHARACTER_MODEL_FILES.rifleJump,
  CHARACTER_MODEL_FILES.pistolJump,
  CHARACTER_MODEL_FILES.meleeAttack,
  CHARACTER_MODEL_FILES.weaponEquip,
]);

const ROOT_MOTION_STRIP_MODEL_FILES = new Set<string>([
  ...ONE_SHOT_MODEL_FILES,
  CHARACTER_MODEL_FILES.reloadWalk,
  CHARACTER_MODEL_FILES.reloadSprint,
]);

export interface RemoteCharacterPose {
  sprinting: boolean;
  walking: boolean;
  jumping: boolean;
  reloading: boolean;
  switchingWeapon: boolean;
  meleeAttacking: boolean;
}

const DEFAULT_BONES: CharacterBoneNames = {
  rightHand: 'mixamorig:RightHand',
  head: 'mixamorig:Head',
  spine: 'mixamorig:Spine1',
};

function assetUrl(file: string): string {
  return `${ASSET_BASE}${encodeURIComponent(file)}`;
}

function pickAnimationClip(animations: THREE.AnimationClip[]): THREE.AnimationClip | null {
  if (animations.length === 0) return null;
  return (
    animations.find((clip) => /jump|idle|run|shoot|aim|walk|reload|melee|attack|equip|shoulder/i.test(clip.name)) ??
    animations[0] ??
    null
  );
}

/** Remove hips/root translation so jump height comes from physics only. */
function stripRootMotionFromClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => !isRootMotionPositionTrack(track));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function isRootMotionPositionTrack(track: THREE.KeyframeTrack): boolean {
  const dot = track.name.indexOf('.');
  if (dot === -1) return false;

  const boneName = track.name.slice(0, dot);
  const property = track.name.slice(dot + 1);
  if (property !== 'position') return false;

  const normalized = boneName.replace(/^mixamorig:?/i, '');
  return /^(Hips|Root)$/i.test(normalized);
}

export interface CharacterBoneNames {
  rightHand: string;
  head: string | null;
  /** Upper-body pitch bone (child of hips — legs stay planted). */
  spine: string;
}

export interface CharacterRig {
  rightHand: THREE.Object3D;
  head: THREE.Object3D;
  spine: THREE.Object3D;
}

function detectBoneNames(root: THREE.Object3D): CharacterBoneNames | null {
  const boneNames: string[] = [];
  root.traverse((child) => {
    if (child.type === 'Bone') {
      boneNames.push(child.name);
    }
  });

  const rightHand =
    boneNames.find((name) => /RightHand$/i.test(name)) ??
    boneNames.find((name) => /RightHand/i.test(name)) ??
    null;
  const head =
    boneNames.find((name) => /:Head$/i.test(name) && !/Top|End/i.test(name)) ??
    boneNames.find((name) => /^Head$/i.test(name)) ??
    null;
  const spine =
    boneNames.find((name) => /Spine1$/i.test(name)) ??
    boneNames.find((name) => /:Spine$/i.test(name) && !/Spine1|Spine2/i.test(name)) ??
    boneNames.find((name) => /Spine$/i.test(name) && !/Spine1|Spine2/i.test(name)) ??
    null;

  if (!rightHand || !spine) return null;
  return { rightHand, head, spine };
}

export function resolveCharacterRig(
  root: THREE.Object3D,
  boneNames: CharacterBoneNames,
): CharacterRig | null {
  let rightHand: THREE.Object3D | null = null;
  let head: THREE.Object3D | null = null;
  let spine: THREE.Object3D | null = null;

  root.traverse((child) => {
    if (child.name === boneNames.rightHand) rightHand = child;
    if (boneNames.head && child.name === boneNames.head) head = child;
    if (child.name === boneNames.spine) spine = child;
  });

  if (!rightHand || !spine) return null;
  return { rightHand, head: head ?? rightHand, spine };
}

const _meshBounds = new THREE.Box3();
const _feetWorld = new THREE.Vector3();

/** World-space Y above `feetObject` to float UI above the character mesh top. */
export function computeTopOffsetAboveFeet(
  meshRoot: THREE.Object3D,
  feetObject: THREE.Object3D,
  clearance = 0.22,
): number {
  meshRoot.updateMatrixWorld(true);
  feetObject.updateMatrixWorld(true);
  _meshBounds.setFromObject(meshRoot);
  feetObject.getWorldPosition(_feetWorld);
  return _meshBounds.max.y - _feetWorld.y + clearance;
}

function prepareModel(model: THREE.Group): { scene: THREE.Group; fitScale: number } {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  model.rotation.set(0, MODEL_YAW, 0);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const fitScale = TARGET_HEIGHT / Math.max(size.y, 0.001);

  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.scale.setScalar(fitScale);
  wrapper.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(wrapper);
  const center = fittedBox.getCenter(new THREE.Vector3());
  wrapper.position.x -= center.x;
  wrapper.position.z -= center.z;
  wrapper.position.y -= fittedBox.min.y;

  return { scene: wrapper, fitScale };
}

export interface CharacterTemplate {
  modelFile: string;
  scene: THREE.Group;
  clip: THREE.AnimationClip | null;
  /** Clip length in seconds (0 when no clip). */
  clipDurationSec: number;
  bones: CharacterBoneNames;
  /** Uniform scale applied to fit the FBX to TARGET_HEIGHT. */
  fitScale: number;
  oneShot: boolean;
}

export interface CharacterInstance {
  root: THREE.Group;
  update(delta: number): void;
  /** True once a one-shot clip has reached its final frame. */
  readonly isOneShotFinished: boolean;
  dispose(): void;
}

const templateCache = new Map<string, CharacterTemplate>();
const loadPromises = new Map<string, Promise<CharacterTemplate>>();

const SKIN_WEIGHT_WARNING = 'more than 4 skinning weights';

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

async function loadCharacterTemplateByFile(modelFile: string): Promise<CharacterTemplate> {
  const cached = templateCache.get(modelFile);
  if (cached) return cached;

  const pending = loadPromises.get(modelFile);
  if (pending) return pending;

  const promise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(ASSET_BASE);
    const fbx = await loadFbx(loader, assetUrl(modelFile));
    const oneShot = ONE_SHOT_MODEL_FILES.has(modelFile);
    let clip = pickAnimationClip(fbx.animations);
    if (ROOT_MOTION_STRIP_MODEL_FILES.has(modelFile) && clip) {
      clip = stripRootMotionFromClip(clip);
    }
    const { scene, fitScale } = prepareModel(fbx);
    const bones = detectBoneNames(fbx) ?? DEFAULT_BONES;
    const template: CharacterTemplate = {
      modelFile,
      scene,
      clip,
      clipDurationSec: clip?.duration ?? 0,
      bones,
      fitScale,
      oneShot,
    };
    templateCache.set(modelFile, template);
    return template;
  })().finally(() => {
    loadPromises.delete(modelFile);
  });

  loadPromises.set(modelFile, promise);
  return promise;
}

export function gameModelFileForWeapon(
  weaponId: WeaponId,
  pose: RemoteCharacterPose,
): string {
  if (pose.jumping) {
    return weaponId === 'pistol'
      ? CHARACTER_MODEL_FILES.pistolJump
      : CHARACTER_MODEL_FILES.rifleJump;
  }

  if (pose.meleeAttacking && weaponId === MELEE_WEAPON_ID) {
    return CHARACTER_MODEL_FILES.meleeAttack;
  }

  if (pose.switchingWeapon) {
    return CHARACTER_MODEL_FILES.weaponEquip;
  }

  if (pose.reloading) {
    if (pose.sprinting) return CHARACTER_MODEL_FILES.reloadSprint;
    if (pose.walking) return CHARACTER_MODEL_FILES.reloadWalk;
    return CHARACTER_MODEL_FILES.reloadIdle;
  }

  if (pose.sprinting) {
    return weaponId === 'pistol'
      ? CHARACTER_MODEL_FILES.pistolRun
      : CHARACTER_MODEL_FILES.rifleRunShoot;
  }

  if (pose.walking) {
    return weaponId === 'pistol'
      ? CHARACTER_MODEL_FILES.pistolWalk
      : CHARACTER_MODEL_FILES.rifleWalking;
  }

  if (weaponId === MELEE_WEAPON_ID) {
    return CHARACTER_MODEL_FILES.meleeIdle;
  }

  return weaponId === 'pistol'
    ? CHARACTER_MODEL_FILES.pistolIdle
    : CHARACTER_MODEL_FILES.rifleAimingIdle;
}

/** @deprecated Use gameModelFileForWeapon. */
export function gameIdleModelFileForWeapon(weaponId: WeaponId): string {
  return gameModelFileForWeapon(weaponId, {
    sprinting: false,
    walking: false,
    jumping: false,
    reloading: false,
    switchingWeapon: false,
    meleeAttacking: false,
  });
}

export function loadGameCharacterTemplate(
  weaponId: WeaponId,
  pose: RemoteCharacterPose,
): Promise<CharacterTemplate> {
  return loadCharacterTemplateByFile(gameModelFileForWeapon(weaponId, pose));
}

export function loadLobbyCharacterTemplate(): Promise<CharacterTemplate> {
  return loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.lobby);
}

/** @deprecated Use loadGameCharacterTemplate. */
export function loadGameIdleCharacterTemplate(weaponId: WeaponId): Promise<CharacterTemplate> {
  return loadGameCharacterTemplate(weaponId, {
    sprinting: false,
    walking: false,
    jumping: false,
    reloading: false,
    switchingWeapon: false,
    meleeAttacking: false,
  });
}

export function preloadGameCharacterModels(): Promise<CharacterTemplate[]> {
  return Promise.all([
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleAimingIdle),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolIdle),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleRunShoot),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolRun),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleWalking),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolWalk),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleJump),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolJump),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.reloadIdle),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.reloadWalk),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.reloadSprint),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.meleeIdle),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.meleeAttack),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.weaponEquip),
  ]);
}

/** @deprecated Use loadLobbyCharacterTemplate or loadGameIdleCharacterTemplate. */
export function loadCharacterTemplate(): Promise<CharacterTemplate> {
  return loadLobbyCharacterTemplate();
}

export function createCharacterInstance(template: CharacterTemplate): CharacterInstance {
  const root = cloneSkeleton(template.scene) as THREE.Group;

  let mixer: THREE.AnimationMixer | null = null;
  let oneShotFinished = false;

  if (template.clip) {
    mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(template.clip);

    if (template.oneShot) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.zeroSlopeAtStart = true;
      action.zeroSlopeAtEnd = true;
      mixer.addEventListener('finished', (event) => {
        if (event.action === action) oneShotFinished = true;
      });
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    action.play();
    mixer.update(0);
  }

  return {
    root,
    get isOneShotFinished() {
      return oneShotFinished;
    },
    update(delta: number) {
      mixer?.update(delta);
    },
    dispose() {
      mixer?.stopAllAction();
      mixer = null;
      root.removeFromParent();
    },
  };
}
