import * as THREE from 'three';
import {
  PHYSICAL_SIGHT_OBJECT_NAME,
  SCOPE_CAMERA_DECAL_NAME,
  getSightMount,
} from '../content/physicalWeaponSights';

/** Scope tube body — hidden while ADS and while un-zooming to hip. */
export const SNIPER_SCOPE_BODY_NAME = 'sniper_sight_01';
/** Eye-end piece (lens mount) — visible only when fully ADS or fully hip. */
export const SNIPER_SCOPE_END_NAME = 'sniper_sight_01.end';

/** When mesh projection undershoots, keep the cross at least this fraction of the short viewport edge. */
const SCOPE_END_VIEWPORT_FLOOR = 0.88;
/** Final sniper ADS cross scale vs measured / floored ring diameter. */
const SCOPE_END_CROSS_SIZE_SCALE = 0.9;

const _storedVisible = new WeakMap<THREE.Object3D, boolean>();
const _endBox = new THREE.Box3();
const _endCenter = new THREE.Vector3();
const _endSize = new THREE.Vector3();
const _endCamPos = new THREE.Vector3();
const _endNdc = new THREE.Vector3();
const _endVert = new THREE.Vector3();
const _endScreen = {
  sizePx: 0,
  offsetX: 0,
  offsetY: 0,
};

/**
 * Look-speed scale so mouse travel tracks optic magnification:
 * `userSens * (adsFov / hipFov) * 2`.
 */
export function getOpticAdsLookSensitivityScale(
  adsFov: number,
  hipFov: number,
): number {
  if (!(hipFov > 0) || !(adsFov > 0)) return 1;
  return THREE.MathUtils.clamp((adsFov / hipFov) * 2, 0.01, 1);
}

function findPhysicalSightRoot(weaponRoot: THREE.Object3D): THREE.Object3D | null {
  const mount = getSightMount(weaponRoot);
  if (!mount) return null;
  return mount.getObjectByName(PHYSICAL_SIGHT_OBJECT_NAME) ?? null;
}

function findSniperScopeEnd(weaponRoot: THREE.Object3D): THREE.Object3D | null {
  const endName = SNIPER_SCOPE_END_NAME.toLowerCase();
  let found: THREE.Object3D | null = null;
  weaponRoot.traverse((child) => {
    if (found || !child.name) return;
    if (normName(child) === endName) found = child;
  });
  return found;
}

function normName(object: THREE.Object3D): string {
  return object.name?.trim().toLowerCase() ?? '';
}

export type SniperScopeEndScreenMetrics = {
  /** Pixel diameter covering the visible end ring. */
  readonly sizePx: number;
  /** Offset from viewport center to the end-ring center (CSS px). */
  readonly offsetX: number;
  readonly offsetY: number;
};

/**
 * Project `sniper_sight_01.end` into screen space so the HUD cross can match
 * the visible scope eye-ring (lens-sized reticle).
 */
export function measureSniperScopeEndOnScreen(
  weaponRoot: THREE.Object3D,
  camera: THREE.Camera,
  viewWidth: number,
  viewHeight: number,
): SniperScopeEndScreenMetrics | null {
  if (!(viewWidth > 0) || !(viewHeight > 0)) return null;
  const end = findSniperScopeEnd(weaponRoot);
  if (!end) return null;

  camera.updateMatrixWorld(true);
  end.updateWorldMatrix(true, true);

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let samples = 0;

  end.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const pos = child.geometry.attributes.position;
    if (!pos) return;
    child.updateWorldMatrix(true, false);
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) {
      _endVert.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      _endVert.project(camera);
      const sx = (_endVert.x * 0.5 + 0.5) * viewWidth;
      const sy = (-_endVert.y * 0.5 + 0.5) * viewHeight;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
      samples++;
    }
  });

  let sizePx = 0;
  let offsetX = 0;
  let offsetY = 0;

  if (samples >= 4) {
    sizePx = Math.max(maxX - minX, maxY - minY);
    offsetX = (minX + maxX) * 0.5 - viewWidth * 0.5;
    offsetY = (minY + maxY) * 0.5 - viewHeight * 0.5;
  } else {
    _endBox.setFromObject(end);
    if (_endBox.isEmpty()) return null;
    _endBox.getCenter(_endCenter);
    _endBox.getSize(_endSize);
    const radius = 0.5 * Math.max(_endSize.x, _endSize.y, _endSize.z);
    camera.getWorldPosition(_endCamPos);
    const dist = _endCamPos.distanceTo(_endCenter);
    const fovYDeg =
      camera instanceof THREE.PerspectiveCamera ? camera.fov : 75;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovYDeg) * 0.5);
    if (!(radius > 1e-6) || !(dist > 1e-6) || !(tanHalf > 1e-6)) return null;
    sizePx = (radius / (dist * tanHalf)) * viewHeight;
    _endNdc.copy(_endCenter).project(camera);
    offsetX = (_endNdc.x * 0.5) * viewWidth;
    offsetY = (-_endNdc.y * 0.5) * viewHeight;
  }

  const viewportFloor = Math.min(viewWidth, viewHeight) * SCOPE_END_VIEWPORT_FLOOR;
  sizePx = Math.max(sizePx, viewportFloor) * 1.02 * SCOPE_END_CROSS_SIZE_SCALE;
  if (!(sizePx > 4)) return null;

  _endScreen.sizePx = sizePx;
  _endScreen.offsetX = offsetX;
  _endScreen.offsetY = offsetY;
  return _endScreen;
}

function isUnderNamed(
  object: THREE.Object3D,
  ancestorName: string,
  stopAt: THREE.Object3D,
): boolean {
  let current: THREE.Object3D | null = object.parent;
  while (current && current !== stopAt) {
    if (normName(current) === ancestorName) return true;
    current = current.parent;
  }
  return false;
}

function createAdsLensMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    colorWrite: false,
  });
}

function ensureLensMaterials(lens: THREE.Mesh): {
  hip: THREE.Material;
  ads: THREE.MeshBasicMaterial;
} {
  const existingHip = lens.userData.scopeLensHipMaterial as THREE.Material | undefined;
  const existingAds = lens.userData.scopeLensAdsMaterial as THREE.MeshBasicMaterial | undefined;
  if (existingHip && existingAds) {
    return { hip: existingHip, ads: existingAds };
  }

  const current = Array.isArray(lens.material) ? lens.material[0] : lens.material;
  const hip =
    existingHip ??
    (current?.clone() ??
      new THREE.MeshPhongMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveIntensity: 1,
        shininess: 0,
      }));

  const ads = existingAds ?? createAdsLensMaterial();
  lens.userData.scopeLensHipMaterial = hip;
  lens.userData.scopeLensAdsMaterial = ads;
  return { hip, ads };
}

function detachLensFromBody(
  sight: THREE.Object3D,
  lens: THREE.Object3D,
  bodyName: string,
): void {
  if (!isUnderNamed(lens, bodyName, sight) && normName(lens.parent ?? sight) !== bodyName) {
    return;
  }
  if (lens.parent === sight) return;
  sight.attach(lens);
}

function clearLegacyLensCross(lens: THREE.Object3D): void {
  const legacy = lens.getObjectByName('scopeLensCrossOverlay');
  if (!legacy) return;
  legacy.removeFromParent();
  legacy.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

function rememberAndSetVisible(object: THREE.Object3D, visible: boolean): void {
  if (!_storedVisible.has(object)) {
    _storedVisible.set(object, object.visible);
  }
  object.visible = visible ? (_storedVisible.get(object) ?? true) : false;
}

/** ADS pose/FOV considered fully settled (end-ring can show; HUD waits further). */
export const SNIPER_OPTIC_ADS_READY_BLEND = 0.97;
/** Hip pose considered fully settled (full scope body+end restore together). */
export const SNIPER_OPTIC_HIP_READY_BLEND = 0.02;
/** Delay after optic ready before crosshair / red pip / vignette / circle blur. */
export const OPTIC_HUD_REVEAL_DELAY_SEC = 0.05;

export type SniperScopeAdsVisualState = {
  /** RMB ADS held. */
  readonly adsIntent: boolean;
  /** Smooth pose blend 0..1. */
  readonly adsBlend: number;
};

export function isSniperOpticAdsReady(adsBlend: number): boolean {
  return adsBlend >= SNIPER_OPTIC_ADS_READY_BLEND;
}

/**
 * Sniper optic mesh visibility:
 *
 *   Hipfire (!RMB):
 *     - body + lens + end visible immediately
 *
 *   ADS (RMB held):
 *     - body + lens hidden immediately
 *     - end-ring shown only once ADS blend has settled
 */
export function syncSniperScopeAdsVisuals(
  weaponRoot: THREE.Object3D,
  state: SniperScopeAdsVisualState,
): void {
  const { adsIntent, adsBlend } = state;
  const fullyAds = isSniperOpticAdsReady(adsBlend);

  // Hipfire: full optic as soon as RMB is released. ADS: stow body + lens immediately.
  const showBody = !adsIntent;
  const showLens = !adsIntent;
  const showEnd = adsIntent ? fullyAds : true;

  const sight = findPhysicalSightRoot(weaponRoot);
  if (!sight) return;

  const bodyName = SNIPER_SCOPE_BODY_NAME.toLowerCase();
  const endName = SNIPER_SCOPE_END_NAME.toLowerCase();
  const lensName = SCOPE_CAMERA_DECAL_NAME.toLowerCase();

  let lens: THREE.Mesh | null = null;
  sight.traverse((child) => {
    if (lens || !(child instanceof THREE.Mesh)) return;
    if (normName(child) === lensName) lens = child;
  });

  if (lens) {
    detachLensFromBody(sight, lens, bodyName);
    clearLegacyLensCross(lens);
    const { hip } = ensureLensMaterials(lens);
    lens.material = hip;
    lens.visible = showLens;
    lens.castShadow = showLens;
    lens.receiveShadow = showLens;
  }

  sight.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const name = normName(child);
    if (!name || name === lensName) return;

    if (name === endName) {
      rememberAndSetVisible(child, showEnd);
      return;
    }

    if (name === bodyName) {
      rememberAndSetVisible(child, showBody);
    }
  });
}
