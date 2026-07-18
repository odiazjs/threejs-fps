import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DEFAULT_FACE_ID, getFaceDef } from '../content/characterFaces';

const FACE_ATTACH_NAME = 'characterFaceAttach';
const BONE_COLLAPSE_SCALE = 1e-3;
const ASSET_BASE = '/3d/';

/**
 * Mixamo FBX bone space is centimeters (same as remoteWeaponMount offsets).
 * Root fitScale then brings the whole character to TARGET_HEIGHT.
 */
const TARGET_HEAD_HEIGHT = 36;
/**
 * Extra offset from the Neck bone's rest position (face mounts on Neck's parent
 * so collapsing Neck/Head does not shrink the face). Negative Y seats it lower.
 */
const FACE_MOUNT_OFFSET_Y = -6;
const FACE_MOUNT_OFFSET_Z = -2;

const SKIN_WEIGHT_WARNING = 'more than 4 skinning weights';

interface FaceModelTemplate {
  readonly faceId: string;
  readonly scene: THREE.Group;
}

const templateCache = new Map<string, FaceModelTemplate>();
const loadPromises = new Map<string, Promise<FaceModelTemplate>>();

export interface CharacterFaceAttachResult {
  readonly faceId: string;
  /** Spine/chest bone the face is parented to (Neck/Head are collapsed). */
  readonly mountParent: THREE.Object3D;
  /** Parent look-rigs / aim helpers here — not on collapsed Neck/Head. */
  readonly faceAnchor: THREE.Group;
}

function assetUrl(file: string): string {
  return `${ASSET_BASE}${file.split('/').map(encodeURIComponent).join('/')}`;
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

function collapseHeadAndNeck(head: THREE.Object3D, neck: THREE.Object3D): void {
  head.scale.setScalar(BONE_COLLAPSE_SCALE);
  // Hide neck collar verts so the 3D face can sit lower into the shoulders.
  neck.scale.setScalar(BONE_COLLAPSE_SCALE);
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

function prepareFaceModel(fbx: THREE.Group): THREE.Group {
  fbx.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });

  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fbx);
  const center = box.getCenter(new THREE.Vector3());

  // Pivot at the chin / neck attach: centered XZ, bottom at y=0.
  fbx.position.x -= center.x;
  fbx.position.z -= center.z;
  fbx.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.add(fbx);
  wrapper.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(wrapper);
  const size = fitted.getSize(new THREE.Vector3());
  const scale = TARGET_HEAD_HEIGHT / Math.max(size.y, 0.001);
  wrapper.scale.setScalar(scale);

  return wrapper;
}

async function loadFaceModelTemplate(faceId: string): Promise<FaceModelTemplate> {
  const def = getFaceDef(faceId);
  // Cache by model path so characters sharing a placeholder head FBX share one prepare.
  const cacheKey = def.modelFile;
  const cached = templateCache.get(cacheKey);
  if (cached) return { ...cached, faceId: def.id };

  const pending = loadPromises.get(cacheKey);
  if (pending) return pending.then((template) => ({ ...template, faceId: def.id }));

  const promise = (async () => {
    const loader = new FBXLoader();
    const slash = def.modelFile.lastIndexOf('/');
    const modelDir = slash >= 0 ? def.modelFile.slice(0, slash + 1) : '';
    loader.setResourcePath(assetUrl(modelDir));
    const fbx = await loadFbx(loader, assetUrl(def.modelFile));
    const scene = prepareFaceModel(fbx);
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
 * Collapse the skinned body head + neck and attach a 3D face head at the upper spine.
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
  collapseHeadAndNeck(head, neck);

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
  collapseHeadAndNeck(headAfter, neckAfter);

  // Mount on the spine (Neck's parent) using the Neck bone's local rest slot, then lower.
  const def = getFaceDef(faceId);
  const rot = def.rotationDeg;
  const faceAnchor = new THREE.Group();
  faceAnchor.name = FACE_ATTACH_NAME;
  faceAnchor.position.set(
    neckAfter.position.x,
    neckAfter.position.y + FACE_MOUNT_OFFSET_Y,
    neckAfter.position.z + FACE_MOUNT_OFFSET_Z,
  );
  faceAnchor.rotation.set(
    THREE.MathUtils.degToRad(rot?.x ?? 0),
    THREE.MathUtils.degToRad(rot?.y ?? 0),
    THREE.MathUtils.degToRad(rot?.z ?? 0),
  );
  faceAnchor.frustumCulled = false;
  faceAnchor.add(cloneFaceScene(template));
  mountParent.add(faceAnchor);

  return { faceId: template.faceId, mountParent, faceAnchor };
}

/** Spine/chest (or Neck fallback) for look-rig parenting while Neck/Head are collapsed. */
export function resolveFaceLookParent(characterRoot: THREE.Object3D): THREE.Object3D | null {
  const head = findBoneBySuffix(characterRoot, 'Head');
  const neck = findBoneBySuffix(characterRoot, 'Neck') ?? head?.parent ?? null;
  return neck?.parent ?? neck ?? head;
}
