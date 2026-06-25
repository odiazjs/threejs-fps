import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WeaponId } from '../../shared/content/weaponIds';

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
} as const;

export interface RemoteCharacterPose {
  sprinting: boolean;
  walking: boolean;
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
    animations.find((clip) => /idle|run|shoot|aim|walk/i.test(clip.name)) ??
    animations[0] ??
    null
  );
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
  bones: CharacterBoneNames;
  /** Uniform scale applied to fit the FBX to TARGET_HEIGHT. */
  fitScale: number;
}

export interface CharacterInstance {
  root: THREE.Group;
  update(delta: number): void;
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
    const clip = pickAnimationClip(fbx.animations);
    const { scene, fitScale } = prepareModel(fbx);
    const bones = detectBoneNames(fbx) ?? DEFAULT_BONES;
    const template: CharacterTemplate = { modelFile, scene, clip, bones, fitScale };
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

  return weaponId === 'pistol'
    ? CHARACTER_MODEL_FILES.pistolIdle
    : CHARACTER_MODEL_FILES.rifleAimingIdle;
}

/** @deprecated Use gameModelFileForWeapon. */
export function gameIdleModelFileForWeapon(weaponId: WeaponId): string {
  return gameModelFileForWeapon(weaponId, { sprinting: false, walking: false });
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
  return loadGameCharacterTemplate(weaponId, { sprinting: false, walking: false });
}

export function preloadGameCharacterModels(): Promise<CharacterTemplate[]> {
  return Promise.all([
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleAimingIdle),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolIdle),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleRunShoot),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolRun),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.rifleWalking),
    loadCharacterTemplateByFile(CHARACTER_MODEL_FILES.pistolWalk),
  ]);
}

/** @deprecated Use loadLobbyCharacterTemplate or loadGameIdleCharacterTemplate. */
export function loadCharacterTemplate(): Promise<CharacterTemplate> {
  return loadLobbyCharacterTemplate();
}

export function createCharacterInstance(template: CharacterTemplate): CharacterInstance {
  const root = cloneSkeleton(template.scene) as THREE.Group;

  let mixer: THREE.AnimationMixer | null = null;
  if (template.clip) {
    mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(template.clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    mixer.update(0);
  }

  return {
    root,
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
