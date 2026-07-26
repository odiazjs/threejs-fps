import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { WeaponId } from '../../shared/content/weaponIds';
import {
  PRECISION_CORE_SIGHT_ID,
  RETHER_PULSE_SIGHT_ID,
  SNIPER_PRECISION_SIGHT_ID,
  type DigitalSightId,
} from '../../shared/content/weaponUnlockables';
import {
  fbxWeaponAssetUrl,
  FBX_WEAPON_ASSET_BASE,
} from './fbxWeaponMesh';

export const SIGHT_MOUNT_NAME = 'sight_mount';
export const PHYSICAL_SIGHT_OBJECT_NAME = 'physicalSight';
/** Optic glass mesh that receives the sniper scope render-target view. */
export const SCOPE_CAMERA_DECAL_NAME = 'scope_camera_decal';

/**
 * Mount-space pose for Meshy optics on an identity-cleared `sight_mount`:
 * 180° Y aims the objective toward the muzzle; keep Y-up (no +90° X tip).
 */
const PHYSICAL_SIGHT_MOUNT_ROTATION = new THREE.Euler(0, Math.PI, 0);

/** Extra uniform scale on top of per-asset fit (pistol baseline). */
const PHYSICAL_SIGHT_MOUNT_SCALE = 1.15;

/**
 * Target geometric mean of AABB edges after orientation.
 * Matches sight_1's bulk so flatter assets (sight_2) get the same overall scale-up
 * instead of only matching their longest axis (which left sight_2 looking tiny).
 */
const PHYSICAL_SIGHT_FIT_GEO_MEAN = 2.48;

/**
 * Manual optic scale per host weapon × attachment.
 * Position always stays at the authored `sight_mount` (local 0,0,0) — only scale.
 *
 * Lookup order: `weapon → sightId` → `weapon → default` → `1`.
 * Final mount scale = asset `mountScale` (or PHYSICAL_SIGHT_MOUNT_SCALE) × this value.
 * Edit these numbers to fine-tune in armory / in-game.
 */
export const PHYSICAL_SIGHT_SCALE_BY_WEAPON: Partial<
  Record<WeaponId, Partial<Record<DigitalSightId | 'default', number>>>
> = {
  pistol: {
    default: 1,
    [RETHER_PULSE_SIGHT_ID]: 1,
    [PRECISION_CORE_SIGHT_ID]: 1.4,
    [SNIPER_PRECISION_SIGHT_ID]: 0.9,
  },
  plasma_rifle: {
    default: 1.33,
    [RETHER_PULSE_SIGHT_ID]: 0.672244,
    [PRECISION_CORE_SIGHT_ID]: 1.33,
    [SNIPER_PRECISION_SIGHT_ID]: 1.2,
  },
  sniper_rifle: {
    default: 1.75,
    [RETHER_PULSE_SIGHT_ID]: 1.75,
    [PRECISION_CORE_SIGHT_ID]: 1.75,
    [SNIPER_PRECISION_SIGHT_ID]: 1.75,
  },
};

function lookupWeaponSightScale(
  weaponId: WeaponId | null | undefined,
  sightId: string,
): number {
  if (!weaponId) return 1;
  const row = PHYSICAL_SIGHT_SCALE_BY_WEAPON[weaponId];
  if (!row) return 1;
  const specific = row[sightId as DigitalSightId];
  if (typeof specific === 'number' && Number.isFinite(specific) && specific > 0) {
    return specific;
  }
  const fallback = row.default;
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return 1;
}

interface PhysicalSightAsset {
  readonly modelFile: string;
  readonly textureUrl: string;
  /**
   * Optional geo-mean fit target after orientation (default PHYSICAL_SIGHT_FIT_GEO_MEAN).
   * Larger = bulkier optic in content space (before per-weapon scale).
   */
  readonly fitGeoMean?: number;
  /**
   * Optional extra uniform scale when parenting to `sight_mount`
   * (default PHYSICAL_SIGHT_MOUNT_SCALE), before per-weapon scale.
   */
  readonly mountScale?: number;
  /**
   * Optional mount-space Euler (default PHYSICAL_SIGHT_MOUNT_ROTATION).
   * Use when an asset's authored forward differs from the shared Meshy pose.
   */
  readonly mountRotation?: THREE.Euler;
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
  [SNIPER_PRECISION_SIGHT_ID]: {
    modelFile: 'weapons/sniper_1/sniper_sight_1.fbx',
    textureUrl: '/3d/weapons/sniper_1/sniper_sight_1_texture.png',
    // Scope class — larger than red-dots; per-weapon scale finishes the sniper fit.
    fitGeoMean: 4.5,
    mountScale: 1.35,
  },
};

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const templateCache = new Map<string, THREE.Group>();
const templateLoads = new Map<string, Promise<THREE.Group>>();

/** Bump when mount pose / asset paths change so hot reload does not reuse a stale template. */
const SIGHT_TEMPLATE_POSE_VERSION = 'pose18';

function sightTemplateCacheKey(asset: PhysicalSightAsset): string {
  const fit = asset.fitGeoMean ?? PHYSICAL_SIGHT_FIT_GEO_MEAN;
  const mount = asset.mountScale ?? PHYSICAL_SIGHT_MOUNT_SCALE;
  const rot = asset.mountRotation ?? PHYSICAL_SIGHT_MOUNT_ROTATION;
  return `${asset.modelFile}::${SIGHT_TEMPLATE_POSE_VERSION}::fit${fit}::mnt${mount}::r${rot.x},${rot.y},${rot.z}`;
}

function resolveMountScale(
  asset: PhysicalSightAsset,
  sightId: string,
  weaponId: WeaponId | null | undefined,
): number {
  return (
    (asset.mountScale ?? PHYSICAL_SIGHT_MOUNT_SCALE) *
    lookupWeaponSightScale(weaponId, sightId)
  );
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
    // Scope glass gets a live RT material from ScopeLens — leave it alone.
    if (child.name.toLowerCase() === SCOPE_CAMERA_DECAL_NAME) return;
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
 * Orient + fit the sight mesh around its own local origin so that parenting at
 * identity on the weapon's authored `sight_mount` places the optic's center
 * exactly on that empty's center. No rail/foot offsets — mount owns position.
 */
function normalizeSightForMount(
  fbx: THREE.Group,
  fitGeoMean: number,
  mountRotation: THREE.Euler,
): THREE.Group {
  const root = new THREE.Group();
  root.name = PHYSICAL_SIGHT_OBJECT_NAME;
  root.rotation.copy(mountRotation);
  root.add(fbx);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return root;

  const size = box.getSize(new THREE.Vector3());
  const geoMean = Math.cbrt(Math.max(size.x * size.y * size.z, 1e-9));
  fbx.scale.multiplyScalar(fitGeoMean / geoMean);
  root.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(root);
  const center = fitted.getCenter(new THREE.Vector3());
  const shiftLocal = center
    .clone()
    .negate()
    .applyQuaternion(root.quaternion.clone().invert());
  fbx.position.add(shiftLocal);
  return root;
}

async function loadSightTemplate(asset: PhysicalSightAsset): Promise<THREE.Group> {
  const cacheKey = sightTemplateCacheKey(asset);
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
    const fitGeoMean = asset.fitGeoMean ?? PHYSICAL_SIGHT_FIT_GEO_MEAN;
    const mountRotation = asset.mountRotation ?? PHYSICAL_SIGHT_MOUNT_ROTATION;
    const root = normalizeSightForMount(fbx as THREE.Group, fitGeoMean, mountRotation);
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
  // Prefer the live authored empty in the hierarchy — it's the placement authority.
  const exact = weaponRoot.getObjectByName(SIGHT_MOUNT_NAME);
  if (exact) return exact;

  const lower = SIGHT_MOUNT_NAME.toLowerCase();
  let found: THREE.Object3D | null = null;
  weaponRoot.traverse((child) => {
    if (found || !child.name) return;
    if (child.name.toLowerCase() === lower) found = child;
  });
  if (found) return found;

  return (weaponRoot.userData.weaponSightMount as THREE.Object3D | undefined) ?? null;
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
 * Attach / swap / clear a 3D optic on the weapon's authored `sight_mount`.
 * Position is always the mount empty's center (local 0,0,0) — never guessed.
 */
export function syncPhysicalSightOnWeapon(
  weaponRoot: THREE.Object3D,
  sightId: string | null | undefined,
  weaponId?: WeaponId | null,
): void {
  const mount = getSightMount(weaponRoot);
  if (!mount) return;

  if (weaponId) {
    weaponRoot.userData.weaponId = weaponId;
  }
  const resolvedWeaponId =
    weaponId ?? (weaponRoot.userData.weaponId as WeaponId | undefined) ?? null;

  weaponRoot.userData.weaponSightMount = mount;
  const asset = getPhysicalSightAsset(sightId);
  const currentId = weaponRoot.userData.equippedPhysicalSightId as string | null | undefined;
  const currentScale = weaponRoot.userData.equippedPhysicalSightScale as number | undefined;
  const mountScale =
    asset && sightId ? resolveMountScale(asset, sightId, resolvedWeaponId) : 0;

  if (!asset) {
    clearMountedPhysicalSight(mount);
    weaponRoot.userData.equippedPhysicalSightId = null;
    weaponRoot.userData.equippedPhysicalSightScale = null;
    return;
  }

  if (
    currentId === sightId &&
    currentScale === mountScale &&
    mount.getObjectByName(PHYSICAL_SIGHT_OBJECT_NAME)
  ) {
    return;
  }

  const template = templateCache.get(sightTemplateCacheKey(asset));
  if (!template) {
    // Template still loading — clear stale optic and finish when ready.
    clearMountedPhysicalSight(mount);
    weaponRoot.userData.equippedPhysicalSightId = null;
    weaponRoot.userData.equippedPhysicalSightScale = null;
    void loadSightTemplate(asset).then(() => {
      if (weaponRoot.userData.pendingPhysicalSightId !== sightId) return;
      syncPhysicalSightOnWeapon(weaponRoot, sightId, resolvedWeaponId);
    });
    weaponRoot.userData.pendingPhysicalSightId = sightId;
    return;
  }

  clearMountedPhysicalSight(mount);
  const sight = cloneSightTemplate(template);
  sight.userData.physicalSight = true;
  sight.position.set(0, 0, 0);
  sight.scale.setScalar(mountScale);
  mount.add(sight);
  weaponRoot.userData.equippedPhysicalSightId = sightId;
  weaponRoot.userData.equippedPhysicalSightScale = mountScale;
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
