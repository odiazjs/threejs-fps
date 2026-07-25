import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  PRECISION_CORE_SIGHT_ID,
  RETHER_PULSE_SIGHT_ID,
  type DigitalSightId,
} from '../../shared/content/weaponUnlockables';
import {
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
} from './fbxWeaponMesh';

export const SIGHT_MOUNT_NAME = 'sight_mount';
export const PHYSICAL_SIGHT_OBJECT_NAME = 'physicalSight';

/**
 * Verified mount-space pose for Meshy optics on authored `sight_mount`:
 * +90° X, 180° Y (relative to socket axes after scale-safe reparent).
 */
const PHYSICAL_SIGHT_MOUNT_ROTATION = new THREE.Euler(Math.PI / 2, Math.PI, 0);

/** Extra uniform scale on top of per-asset fit (matches pistol +15% / sight_1). */
const PHYSICAL_SIGHT_MOUNT_SCALE = 1.15;

/**
 * Target geometric mean of AABB edges after orientation.
 * Matches sight_1's bulk so flatter assets (sight_2) get the same overall scale-up
 * instead of only matching their longest axis (which left sight_2 looking tiny).
 */
const PHYSICAL_SIGHT_FIT_GEO_MEAN = 2.48;

interface PhysicalSightAsset {
  readonly modelFile: string;
  readonly textureUrl: string;
}

/** Unlockable sight id → authored FBX + emissive texture (synced with DB asset_key). */
const PHYSICAL_SIGHT_ASSETS: Record<DigitalSightId, PhysicalSightAsset> = {
  [RETHER_PULSE_SIGHT_ID]: {
    modelFile: 'weapons/sights/sight_1.fbx',
    textureUrl: '/3d/weapons/sights/sight_1_texture.png',
  },
  [PRECISION_CORE_SIGHT_ID]: {
    modelFile: 'weapons/assault_rifle_1/sight_2.fbx',
    textureUrl: '/3d/weapons/assault_rifle_1/sight_2_texture.png',
  },
};

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const templateCache = new Map<string, THREE.Group>();
const templateLoads = new Map<string, Promise<THREE.Group>>();

/** Bump when mount pose / asset paths change so hot reload does not reuse a stale template. */
const SIGHT_TEMPLATE_POSE_VERSION = 'pose11';

function sightTemplateCacheKey(modelFile: string): string {
  return `${modelFile}::${SIGHT_TEMPLATE_POSE_VERSION}`;
}

function resourcePathForModelFile(modelFile: string): string {
  const parts = modelFile.split('/').filter(Boolean);
  parts.pop();
  return `${FBX_WEAPON_ASSET_BASE}${parts.join('/')}/`;
}

function loadEmissiveTexture(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        textureCache.set(url, texture);
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function applySightMaterials(root: THREE.Object3D, emissiveMap: THREE.Texture): void {
  const material = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    emissiveMap,
    shininess: 0,
  });

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      for (const old of child.material) old.dispose();
    } else {
      child.material.dispose();
    }
    child.material = material;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function cloneSightTemplate(template: THREE.Group): THREE.Group {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else {
      child.material = child.material.clone();
    }
  });
  return clone;
}

/**
 * Orient + fit the Meshy sight, then bake so its AABB center is at local (0,0,0).
 * Parenting at identity on `sight_mount` then places the optic on the socket XYZ.
 * Fit uses geometric-mean size so sight_2 matches sight_1's scale-up bulk.
 */
function normalizeSightForMount(fbx: THREE.Group): THREE.Group {
  const root = new THREE.Group();
  root.name = PHYSICAL_SIGHT_OBJECT_NAME;
  root.rotation.copy(PHYSICAL_SIGHT_MOUNT_ROTATION);
  root.add(fbx);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return root;

  const size = box.getSize(new THREE.Vector3());
  const geoMean = Math.cbrt(Math.max(size.x * size.y * size.z, 1e-9));
  fbx.scale.multiplyScalar(PHYSICAL_SIGHT_FIT_GEO_MEAN / geoMean);
  root.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(root);
  const center = fitted.getCenter(new THREE.Vector3());
  // Move mesh content so geometric center lands on root origin (all axes).
  const shiftLocal = center
    .clone()
    .negate()
    .applyQuaternion(root.quaternion.clone().invert());
  fbx.position.add(shiftLocal);
  return root;
}

/**
 * Ensure the sight's world-space AABB center matches the mount socket origin
 * on X, Y, and Z (not foot-only / single-axis).
 */
function alignSightCenterToMount(mount: THREE.Object3D, sight: THREE.Object3D): void {
  // Identity in mount space = socket origin (mount already carries authored XYZ).
  sight.position.set(0, 0, 0);
  mount.updateMatrixWorld(true);
  sight.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(sight);
  if (box.isEmpty()) return;

  const mountWorld = new THREE.Vector3();
  mount.getWorldPosition(mountWorld);
  const center = box.getCenter(new THREE.Vector3());
  const shiftWorld = mountWorld.clone().sub(center);

  const targetWorld = sight.getWorldPosition(new THREE.Vector3()).add(shiftWorld);
  mount.worldToLocal(targetWorld);
  sight.position.copy(targetWorld);
}

async function loadSightTemplate(asset: PhysicalSightAsset): Promise<THREE.Group> {
  const cacheKey = sightTemplateCacheKey(asset.modelFile);
  const cached = templateCache.get(cacheKey);
  if (cached) return cached;

  const pending = templateLoads.get(cacheKey);
  if (pending) return pending;

  const load = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(resourcePathForModelFile(asset.modelFile));
    const [fbx, emissiveMap] = await Promise.all([
      loader.loadAsync(fbxWeaponAssetUrl(asset.modelFile)),
      loadEmissiveTexture(asset.textureUrl),
    ]);
    applySightMaterials(fbx as THREE.Group, emissiveMap);
    const root = normalizeSightForMount(fbx as THREE.Group);
    templateCache.set(cacheKey, root);
    templateLoads.delete(cacheKey);
    return root;
  })().catch((err) => {
    templateLoads.delete(cacheKey);
    throw err;
  });

  templateLoads.set(cacheKey, load);
  return load;
}

export function getPhysicalSightAsset(
  sightId: string | null | undefined,
): PhysicalSightAsset | null {
  if (!sightId) return null;
  return PHYSICAL_SIGHT_ASSETS[sightId as DigitalSightId] ?? null;
}

export function weaponHasSightMount(weaponRoot: THREE.Object3D): boolean {
  return getSightMount(weaponRoot) != null;
}

export function getSightMount(weaponRoot: THREE.Object3D): THREE.Object3D | null {
  const fromUserData = weaponRoot.userData.weaponSightMount as THREE.Object3D | undefined;
  if (fromUserData) return fromUserData;

  const exact = weaponRoot.getObjectByName(SIGHT_MOUNT_NAME);
  if (exact) return exact;

  const lower = SIGHT_MOUNT_NAME.toLowerCase();
  let found: THREE.Object3D | null = null;
  weaponRoot.traverse((child) => {
    if (found || !child.name) return;
    if (child.name.toLowerCase() === lower) found = child;
  });
  return found;
}

export function preloadPhysicalSightModels(): Promise<unknown> {
  return Promise.all(
    Object.values(PHYSICAL_SIGHT_ASSETS).map((asset) =>
      loadSightTemplate(asset).catch((err) => {
        console.warn('[PhysicalSight] Failed to preload', asset.modelFile, err);
        return null;
      }),
    ),
  );
}

function clearMountedPhysicalSight(mount: THREE.Object3D): void {
  for (const child of [...mount.children]) {
    if (child.name === PHYSICAL_SIGHT_OBJECT_NAME || child.userData.physicalSight) {
      child.removeFromParent();
    }
  }
}

/**
 * Attach / swap / clear a 3D optic on the weapon's `sight_mount`.
 * Mount is expected to live in fitted content space (not under mesh_node scale).
 */
export function syncPhysicalSightOnWeapon(
  weaponRoot: THREE.Object3D,
  sightId: string | null | undefined,
): void {
  const mount = getSightMount(weaponRoot);
  if (!mount) return;

  weaponRoot.userData.weaponSightMount = mount;
  const asset = getPhysicalSightAsset(sightId);
  const currentId = weaponRoot.userData.equippedPhysicalSightId as string | null | undefined;

  if (!asset) {
    clearMountedPhysicalSight(mount);
    weaponRoot.userData.equippedPhysicalSightId = null;
    return;
  }

  if (currentId === sightId && mount.getObjectByName(PHYSICAL_SIGHT_OBJECT_NAME)) {
    return;
  }

  const template = templateCache.get(sightTemplateCacheKey(asset.modelFile));
  if (!template) {
    // Template still loading — clear stale optic and finish when ready.
    clearMountedPhysicalSight(mount);
    weaponRoot.userData.equippedPhysicalSightId = null;
    void loadSightTemplate(asset).then(() => {
      if (weaponRoot.userData.pendingPhysicalSightId !== sightId) return;
      syncPhysicalSightOnWeapon(weaponRoot, sightId);
    });
    weaponRoot.userData.pendingPhysicalSightId = sightId;
    return;
  }

  clearMountedPhysicalSight(mount);
  const sight = cloneSightTemplate(template);
  sight.userData.physicalSight = true;
  sight.scale.setScalar(PHYSICAL_SIGHT_MOUNT_SCALE);
  mount.add(sight);
  // Center optic on full sight_mount XYZ (authored socket position).
  alignSightCenterToMount(mount, sight);
  weaponRoot.userData.equippedPhysicalSightId = sightId;
  weaponRoot.userData.pendingPhysicalSightId = null;
}

export function setPhysicalSightVisible(weaponRoot: THREE.Object3D, visible: boolean): void {
  const mount = getSightMount(weaponRoot);
  if (!mount) return;
  const sight = mount.getObjectByName(PHYSICAL_SIGHT_OBJECT_NAME);
  if (sight) sight.visible = visible;
}

/** True when this weapon mesh uses rail-mounted 3D optics (not digital sprites). */
export function weaponUsesPhysicalSights(weaponRoot: THREE.Object3D): boolean {
  return weaponHasSightMount(weaponRoot);
}
