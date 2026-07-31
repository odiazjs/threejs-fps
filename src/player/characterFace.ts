import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DEFAULT_FACE_ID, getFaceDef } from '../content/characterFaces';
import { createGltfLoader } from '../content/gltfLoader';
import { optimizeObjectTextures } from '../content/textureQuality';

const FACE_ATTACH_NAME = 'characterFaceAttach';
const BONE_COLLAPSE_SCALE = 1e-3;
const ASSET_BASE = '/3d/';

/**
 * Mixamo FBX bone space is centimeters (same as remoteWeaponMount offsets).
 * Faces are normalized to this height, then multiplied by per-character `faceScale`.
 */
const TARGET_HEAD_HEIGHT = 38;

const SKIN_WEIGHT_WARNING = 'more than 4 skinning weights';

interface FaceModelTemplate {
  readonly faceId: string;
  readonly scene: THREE.Group;
}

const templateCache = new Map<string, FaceModelTemplate>();
const loadPromises = new Map<string, Promise<FaceModelTemplate>>();

export interface CharacterFaceAttachResult {
  readonly faceId: string;
  /** Spine/chest bone the face is parented to. */
  readonly mountParent: THREE.Object3D;
  /** Parent look-rigs / aim helpers here — not on collapsed Head. */
  readonly faceAnchor: THREE.Group;
}

function assetUrl(file: string): string {
  return `${ASSET_BASE}${file.split('/').map(encodeURIComponent).join('/')}`;
}

function isGlbModel(file: string): boolean {
  return /\.glb$/i.test(file) || /\.gltf$/i.test(file);
}

function findBoneBySuffix(root: THREE.Object3D, suffix: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  const re = new RegExp(`${suffix}$`, 'i');
  root.traverse((child) => {
    if (found || child.type !== 'Bone') return;
    if (re.test(child.name) && !/Top|End/i.test(child.name)) {
      found = child;
    }
  });
  return found;
}

/**
 * Hide the helmet by collapsing Head (+ tip bones under it). Leave Neck alone —
 * Neck scale pinches collar verts into a singularity, and deleting head-weighted
 * triangles punches holes through the neck/shoulder blend.
 */
function collapseHeadBones(head: THREE.Object3D): void {
  head.traverse((child) => {
    if (child.type === 'Bone') {
      child.scale.setScalar(BONE_COLLAPSE_SCALE);
    }
  });
  head.scale.setScalar(BONE_COLLAPSE_SCALE);
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

function loadGltf(url: string): Promise<THREE.Group> {
  const loader = createGltfLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    );
  });
}

async function loadFaceSource(modelFile: string): Promise<THREE.Group> {
  const url = assetUrl(modelFile);
  if (isGlbModel(modelFile)) {
    return loadGltf(url);
  }

  const loader = new FBXLoader();
  const slash = modelFile.lastIndexOf('/');
  const modelDir = slash >= 0 ? modelFile.slice(0, slash + 1) : '';
  loader.setResourcePath(assetUrl(modelDir));
  return loadFbx(loader, url);
}

function prepareFaceModel(source: THREE.Group): THREE.Group {
  optimizeObjectTextures(source);
  source.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });

  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());

  // Pivot at the chin / neck attach: centered XZ, bottom at y=0.
  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.add(source);
  wrapper.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(wrapper);
  const size = fitted.getSize(new THREE.Vector3());
  const scale = TARGET_HEAD_HEIGHT / Math.max(size.y, 0.001);
  wrapper.scale.setScalar(scale);

  return wrapper;
}

async function loadFaceModelTemplate(faceId: string): Promise<FaceModelTemplate> {
  const def = getFaceDef(faceId);
  // Cache by model path so characters sharing a head asset share one prepare.
  const cacheKey = def.modelFile;
  const cached = templateCache.get(cacheKey);
  if (cached) return { ...cached, faceId: def.id };

  const pending = loadPromises.get(cacheKey);
  if (pending) return pending.then((template) => ({ ...template, faceId: def.id }));

  const promise = (async () => {
    const source = await loadFaceSource(def.modelFile);
    const scene = prepareFaceModel(source);
    const template: FaceModelTemplate = { faceId: def.id, scene };
    templateCache.set(cacheKey, template);
    return template;
  })().finally(() => {
    loadPromises.delete(cacheKey);
  });

  loadPromises.set(cacheKey, promise);
  return promise;
}

export function preloadCharacterFace(faceId: string = DEFAULT_FACE_ID): Promise<void> {
  return loadFaceModelTemplate(faceId).then(() => undefined);
}

function clearExistingFace(root: THREE.Object3D): void {
  const stale: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.name === FACE_ATTACH_NAME) stale.push(child);
  });
  for (const node of stale) {
    node.removeFromParent();
  }
}

function cloneFaceScene(template: FaceModelTemplate): THREE.Group {
  return cloneSkeleton(template.scene) as THREE.Group;
}

/**
 * Hide the skinned helmet and attach a 3D face at the upper spine.
 * Safe to call after every character instance create / pose remount.
 */
export async function applyCharacterFace(
  characterRoot: THREE.Object3D,
  faceId: string = DEFAULT_FACE_ID,
): Promise<CharacterFaceAttachResult | null> {
  const head = findBoneBySuffix(characterRoot, 'Head');
  const neck =
    findBoneBySuffix(characterRoot, 'Neck') ??
    head?.parent ??
    null;
  if (!head || !neck) {
    console.warn('[characterFace] Head/Neck bones not found — face skipped');
    return null;
  }

  clearExistingFace(characterRoot);
  collapseHeadBones(head);

  let template: FaceModelTemplate;
  try {
    template = await loadFaceModelTemplate(faceId);
  } catch (error) {
    console.warn('[characterFace] Failed to load face model', faceId, error);
    return null;
  }

  // Pose remount may have replaced the character while we were loading.
  const headAfter = findBoneBySuffix(characterRoot, 'Head');
  const neckAfter =
    findBoneBySuffix(characterRoot, 'Neck') ??
    headAfter?.parent ??
    null;
  const mountParent = neckAfter?.parent ?? null;
  if (!headAfter || !neckAfter || !mountParent) {
    return null;
  }

  clearExistingFace(characterRoot);
  collapseHeadBones(headAfter);

  // Mount on the spine (Neck's parent) using the Neck bone's local rest slot + per-character transform.
  const def = getFaceDef(faceId);
  const rot = def.rotationDeg;
  const faceAnchor = new THREE.Group();
  faceAnchor.name = FACE_ATTACH_NAME;
  faceAnchor.position.set(
    neckAfter.position.x,
    neckAfter.position.y + def.offsetY,
    neckAfter.position.z + def.offsetZ,
  );
  faceAnchor.rotation.set(
    THREE.MathUtils.degToRad(rot?.x ?? 0),
    THREE.MathUtils.degToRad(rot?.y ?? 0),
    THREE.MathUtils.degToRad(rot?.z ?? 0),
  );
  faceAnchor.scale.setScalar(def.scale);
  faceAnchor.frustumCulled = false;
  faceAnchor.add(cloneFaceScene(template));
  mountParent.add(faceAnchor);

  return { faceId: template.faceId, mountParent, faceAnchor };
}

/** Spine/chest (or Neck fallback) for look-rig parenting. */
export function resolveFaceLookParent(characterRoot: THREE.Object3D): THREE.Object3D | null {
  const head = findBoneBySuffix(characterRoot, 'Head');
  const neck = findBoneBySuffix(characterRoot, 'Neck') ?? head?.parent ?? null;
  return neck?.parent ?? neck ?? head;
}
