import * as THREE from 'three';
import { configureColorTexture } from '../content/textureQuality';

export const DIGITAL_SIGHT_OBJECT_NAME = 'digitalSight';
export const DIGITAL_SIGHT_SOCKET_NAME = 'digital_sight';

export interface DigitalSightStyle {
  /** PNG under /images/ (synced from images/). */
  readonly textureUrl: string;
  /**
   * Optic size in weapon-root space (before viewmodel 0.1 scale).
   * Parent must be the weapon root — not the FBX content group.
   */
  readonly size?: number;
}

export interface DigitalSightMountConfig {
  /**
   * 0 = at muzzle end, 1 = at rear of bounds (along barrel axis).
   */
  readonly alongBarrelFromMuzzle?: number;
  /** Extra lift above the top of the weapon AABB. */
  readonly heightAboveTop?: number;
  /** 0 = left, 1 = right across the weapon width. */
  readonly lateral?: number;
  readonly style: DigitalSightStyle;
}

const DEFAULT_SIZE = 0.9;

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const textureLoads = new Map<string, Promise<THREE.Texture>>();

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _anchorWorld = new THREE.Vector3();
const _toAnchor = new THREE.Vector3();
const _desiredWorld = new THREE.Vector3();

/** Preload a reticle PNG (call during weapon preload). */
export function preloadDigitalSightTexture(textureUrl: string): Promise<THREE.Texture> {
  const cached = textureCache.get(textureUrl);
  if (cached) return Promise.resolve(cached);

  const pending = textureLoads.get(textureUrl);
  if (pending) return pending;

  const load = new Promise<THREE.Texture>((resolve, reject) => {
    textureLoader.load(
      textureUrl,
      (texture) => {
        configureColorTexture(texture);
        textureCache.set(textureUrl, texture);
        textureLoads.delete(textureUrl);
        resolve(texture);
      },
      undefined,
      (err) => {
        textureLoads.delete(textureUrl);
        console.warn('[DigitalSight] Failed to load reticle', textureUrl, err);
        reject(err);
      },
    );
  });

  textureLoads.set(textureUrl, load);
  return load;
}

function getReticleTexture(textureUrl: string): THREE.Texture | null {
  return textureCache.get(textureUrl) ?? null;
}

function getSightSocket(weaponRoot: THREE.Object3D): THREE.Object3D | null {
  return (
    (weaponRoot.userData.weaponDigitalSight as THREE.Object3D | undefined) ??
    weaponRoot.getObjectByName(DIGITAL_SIGHT_SOCKET_NAME) ??
    null
  );
}

/**
 * Digital optic from a PNG reticle only — no canvas drawing.
 * Camera-facing sprite; black PNG pixels drop out via additive blend.
 */
export function createDigitalSightVisual(style: DigitalSightStyle): THREE.Group {
  const size = style.size ?? DEFAULT_SIZE;
  const texture = getReticleTexture(style.textureUrl);

  const root = new THREE.Group();
  root.name = DIGITAL_SIGHT_OBJECT_NAME;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(2.4, 2.4, 2.4),
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    sizeAttenuation: true,
  });

  const sprite = new THREE.Sprite(mat);
  sprite.name = 'digitalSightReticle';
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 20;
  sprite.frustumCulled = false;
  root.add(sprite);

  if (!texture) {
    void preloadDigitalSightTexture(style.textureUrl).then((loaded) => {
      mat.map = loaded;
      mat.needsUpdate = true;
    });
  }

  root.userData.digitalSight = true;
  root.userData.textureUrl = style.textureUrl;
  return root;
}

/**
 * Place a digital sight on the weapon ROOT (not FBX content) so size isn't
 * crushed by the content fit-scale. Anchor rests on top-center of the gun;
 * runtime alignment snaps it to the crosshair look ray.
 */
export function mountDigitalSightOnWeapon(
  root: THREE.Group,
  contentName: string,
  mount: DigitalSightMountConfig,
): THREE.Object3D | null {
  const content = root.getObjectByName(contentName);
  if (!content) {
    console.warn('[DigitalSight] Missing content group', contentName);
    return null;
  }

  const existing = root.getObjectByName(DIGITAL_SIGHT_SOCKET_NAME);
  if (existing) {
    root.userData.weaponDigitalSight = existing;
    return existing;
  }

  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  const size = bounds.getSize(new THREE.Vector3());
  const barrelAlongZ = size.z > size.x;

  const along = THREE.MathUtils.clamp(mount.alongBarrelFromMuzzle ?? 0.5, 0, 1);
  const lateralT = THREE.MathUtils.clamp(mount.lateral ?? 0.5, 0, 1);
  const lift = mount.heightAboveTop ?? 0.08;

  let worldX: number;
  let worldY: number;
  let worldZ: number;

  if (barrelAlongZ) {
    worldX = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, lateralT);
    worldY = bounds.max.y + lift;
    worldZ = THREE.MathUtils.lerp(bounds.max.z, bounds.min.z, along);
  } else {
    // Middle of weapon along bore (+X), centered on Z, on top.
    worldX = THREE.MathUtils.lerp(bounds.max.x, bounds.min.x, along);
    worldY = bounds.max.y + lift;
    worldZ = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, lateralT);
  }

  const socket = new THREE.Object3D();
  socket.name = DIGITAL_SIGHT_SOCKET_NAME;
  // Parent to ROOT so only viewmodel 0.1 scale applies (not FBX content scale).
  socket.position.copy(root.worldToLocal(new THREE.Vector3(worldX, worldY, worldZ)));
  socket.userData.restLocalPos = socket.position.clone();
  socket.userData.alignToCrosshair = true;
  socket.frustumCulled = false;

  socket.add(createDigitalSightVisual(mount.style));
  socket.visible = false; // ADS-only — shown via updateDigitalSightAdsVisibility
  root.add(socket);

  root.userData.weaponDigitalSight = socket;
  return socket;
}

/**
 * Snap the optic onto the camera look ray at the gun-mount depth so the
 * reticle sits on the HUD crosshair center (screen center).
 */
export function alignDigitalSightToCrosshair(
  weaponRoot: THREE.Object3D,
  camera: THREE.Camera,
): void {
  const socket = getSightSocket(weaponRoot);
  if (!socket?.visible || !socket.userData.alignToCrosshair) return;

  const parent = socket.parent;
  if (!parent) return;

  const rest = socket.userData.restLocalPos as THREE.Vector3 | undefined;
  if (rest) {
    socket.position.copy(rest);
  }

  parent.updateWorldMatrix(true, false);
  socket.updateWorldMatrix(true, false);
  socket.getWorldPosition(_anchorWorld);

  camera.getWorldPosition(_camPos);
  camera.getWorldDirection(_camDir);
  const depth = Math.max(0.06, _toAnchor.subVectors(_anchorWorld, _camPos).dot(_camDir));
  _desiredWorld.copy(_camPos).addScaledVector(_camDir, depth);

  parent.worldToLocal(_desiredWorld);
  socket.position.copy(_desiredWorld);
}

export function rebindDigitalSightUserData(root: THREE.Group): void {
  const socket = root.getObjectByName(DIGITAL_SIGHT_SOCKET_NAME);
  if (socket) {
    root.userData.weaponDigitalSight = socket;
    if (!socket.userData.restLocalPos) {
      socket.userData.restLocalPos = socket.position.clone();
    }
  }
}

export function setDigitalSightVisible(root: THREE.Object3D, visible: boolean): void {
  const socket = getSightSocket(root);
  if (socket) socket.visible = visible;
}

/** Show optic only while aiming down sights (local FP). */
export function updateDigitalSightAdsVisibility(
  root: THREE.Object3D,
  adsBlend: number,
  allowed = true,
): void {
  const socket = getSightSocket(root);
  if (!socket) return;
  socket.visible = allowed && adsBlend > 0.15;
}

/** Swap the mounted reticle PNG / size for the equipped sight. */
export function applyDigitalSightStyle(
  weaponRoot: THREE.Object3D,
  style: DigitalSightStyle,
): void {
  const socket = getSightSocket(weaponRoot);
  if (!socket) return;

  const visual =
    socket.getObjectByName(DIGITAL_SIGHT_OBJECT_NAME) ??
    socket.children.find((child) => child.userData.digitalSight);
  if (!visual) return;

  const sprite = visual.getObjectByName('digitalSightReticle');
  if (!(sprite instanceof THREE.Sprite)) return;

  const size = style.size ?? DEFAULT_SIZE;
  sprite.scale.set(size, size, 1);

  const mat = sprite.material;
  if (!(mat instanceof THREE.SpriteMaterial)) return;

  if (visual.userData.textureUrl === style.textureUrl && mat.map) {
    return;
  }

  visual.userData.textureUrl = style.textureUrl;
  const cached = getReticleTexture(style.textureUrl);
  if (cached) {
    mat.map = cached;
    mat.needsUpdate = true;
    return;
  }

  void preloadDigitalSightTexture(style.textureUrl).then((loaded) => {
    if (visual.userData.textureUrl !== style.textureUrl) return;
    mat.map = loaded;
    mat.needsUpdate = true;
  });
}
