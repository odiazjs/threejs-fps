import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ASSET_BASE = '/3d/';
export const LOBBY_MAP_MODEL = 'lobby_map.glb';

/** Editor helpers / avatar placeholders — hide so LobbyScene owns the character. */
const HIDDEN_NAME_PATTERN = /^(player|perspectivecamera|camera|armature|mixamorig)/i;

/** Expand prop XZ AABBs so grass doesn't poke through edges. */
const GRASS_BLOCKER_MARGIN = 0.1;
/** Keep a clear pad under the lobby avatar. */
const GRASS_AVATAR_CLEAR_RADIUS = 0.7;
/**
 * Only treat props that sit on / near the Floor as grass blockers
 * (ignore distant canyon rocks).
 */
const GRASS_BLOCKER_MAX_HEIGHT = 2.2;
const GRASS_BLOCKER_MIN_Y = -0.6;

interface XzAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LobbyFloorGrassPlacement {
  readonly halfExtent: number;
  readonly canPlace: (x: number, z: number) => boolean;
}

/** Feet stand pose on the central lobby deck (`platform_1`). */
export interface LobbyStandPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Solid Floor color when the export has no albedo texture. */
const FLOOR_SOLID_COLOR = 0x35354b;

function pickEmissiveTexture(material: THREE.Material): THREE.Texture | null {
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
    return material.emissiveMap ?? material.map ?? null;
  }
  if (material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshLambertMaterial) {
    return material.emissiveMap ?? material.map ?? null;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map ?? null;
  }
  return null;
}

/**
 * Meshy self-lit shading for every lobby prop:
 * black color/specular, emissive 1.0, albedo texture on emissiveMap only.
 */
function toMeshyEmissiveMaterial(
  source: THREE.Material,
  options: { solidEmissive?: number } = {},
): THREE.MeshPhongMaterial {
  const emissiveMap = pickEmissiveTexture(source);
  if (emissiveMap) {
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.needsUpdate = true;
  }

  const solid = options.solidEmissive;
  const emissiveColor =
    emissiveMap != null ? 0xffffff : (solid ?? 0x000000);

  return new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: emissiveColor,
    emissiveIntensity: 1,
    emissiveMap,
    shininess: 0,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
  });
}

function applyMeshyMaterials(mesh: THREE.Mesh): void {
  const isFloor = isFloorObject(mesh) || isFloorObject(mesh.parent ?? mesh);
  const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = sources.map((source) => {
    const converted = toMeshyEmissiveMaterial(
      source,
      isFloor ? { solidEmissive: FLOOR_SOLID_COLOR } : undefined,
    );
    source.dispose();
    return converted;
  });
  mesh.material = next.length === 1 ? next[0]! : next;
}

function prepareLobbyMapRoot(root: THREE.Object3D): void {
  root.name = 'lobby_map';
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if (HIDDEN_NAME_PATTERN.test(child.name)) {
      child.visible = false;
      return;
    }
    if (child instanceof THREE.Camera) {
      child.visible = false;
      return;
    }
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = false;
    child.receiveShadow = true;
    child.frustumCulled = true;
    applyMeshyMaterials(child);
  });
}

function isFloorObject(object: THREE.Object3D): boolean {
  return object.name.toLowerCase() === 'floor';
}

function isCenterPlatformObject(object: THREE.Object3D): boolean {
  const name = object.name.toLowerCase();
  return name === 'platform_1' || name === 'center_platform';
}

function xzOverlaps(a: XzAabb, b: XzAabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function pointInAabb(x: number, z: number, box: XzAabb): boolean {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

/** Loads `lobby_map.glb` as the lobby background environment (no collision). */
export class LobbyMap {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;
  private loaded = false;
  private mapRoot: THREE.Object3D | null = null;

  constructor() {
    this.group.name = 'lobbyMap';
    this.whenReady = this.build();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * World-space feet pose on the central deck (`platform_1` / `center_platform`).
   * Y is the top of the platform bbox so avatars stand on the surface.
   */
  getCenterPlatformStandPose(): LobbyStandPose | null {
    if (!this.mapRoot) return null;
    this.mapRoot.updateWorldMatrix(true, true);

    let platform: THREE.Object3D | null = null;
    this.mapRoot.traverse((child) => {
      if (platform || !child.visible) return;
      if (isCenterPlatformObject(child)) platform = child;
    });
    if (!platform) return null;

    const box = new THREE.Box3().setFromObject(platform);
    if (box.isEmpty()) return null;

    return {
      x: (box.min.x + box.max.x) * 0.5,
      y: box.max.y,
      z: (box.min.z + box.max.z) * 0.5,
    };
  }

  /**
   * Grass only on the authored Floor plane, skipping prop footprints
   * (platforms, rocks, printer, plants, tower, etc.).
   */
  createFloorGrassPlacement(
    avatarClearAt?: { readonly x: number; readonly z: number },
  ): LobbyFloorGrassPlacement | null {
    if (!this.mapRoot) return null;
    this.mapRoot.updateWorldMatrix(true, true);
    const clearX = avatarClearAt?.x ?? 0;
    const clearZ = avatarClearAt?.z ?? 0;

    const floorBox = new THREE.Box3();
    let foundFloor = false;
    this.mapRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible) return;
      if (!isFloorObject(child) && !isFloorObject(child.parent ?? child)) return;
      floorBox.expandByObject(child);
      foundFloor = true;
    });
    if (!foundFloor || floorBox.isEmpty()) return null;

    const floor: XzAabb = {
      minX: floorBox.min.x,
      maxX: floorBox.max.x,
      minZ: floorBox.min.z,
      maxZ: floorBox.max.z,
    };
    const halfExtent = Math.max(
      Math.abs(floor.minX),
      Math.abs(floor.maxX),
      Math.abs(floor.minZ),
      Math.abs(floor.maxZ),
    );

    const blockers: XzAabb[] = [];
    const meshBox = new THREE.Box3();
    this.mapRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible) return;
      if (isFloorObject(child) || isFloorObject(child.parent ?? child)) return;
      if (HIDDEN_NAME_PATTERN.test(child.name)) return;

      meshBox.setFromObject(child);
      if (meshBox.isEmpty()) return;
      if (meshBox.max.y < GRASS_BLOCKER_MIN_Y || meshBox.min.y > GRASS_BLOCKER_MAX_HEIGHT) {
        return;
      }

      const blocker: XzAabb = {
        minX: meshBox.min.x - GRASS_BLOCKER_MARGIN,
        maxX: meshBox.max.x + GRASS_BLOCKER_MARGIN,
        minZ: meshBox.min.z - GRASS_BLOCKER_MARGIN,
        maxZ: meshBox.max.z + GRASS_BLOCKER_MARGIN,
      };
      if (!xzOverlaps(blocker, floor)) return;
      blockers.push(blocker);
    });

    const canPlace = (x: number, z: number): boolean => {
      if (!pointInAabb(x, z, floor)) return false;
      const dx = x - clearX;
      const dz = z - clearZ;
      if (dx * dx + dz * dz < GRASS_AVATAR_CLEAR_RADIUS * GRASS_AVATAR_CLEAR_RADIUS) {
        return false;
      }
      for (const box of blockers) {
        if (pointInAabb(x, z, box)) return false;
      }
      return true;
    };

    return { halfExtent, canPlace };
  }

  private async build(): Promise<void> {
    const loader = new GLTFLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const gltf = await loader.loadAsync(
        `${ASSET_BASE}${encodeURIComponent(LOBBY_MAP_MODEL)}`,
      );
      const mapRoot = gltf.scene;
      prepareLobbyMapRoot(mapRoot);
      this.mapRoot = mapRoot;
      this.group.add(mapRoot);
      this.loaded = true;
      console.info(`[LobbyMap] Loaded ${LOBBY_MAP_MODEL}`);
    } catch (error) {
      console.warn(
        `[LobbyMap] Failed to load ${LOBBY_MAP_MODEL} — lobby will use sky + grass only`,
        error,
      );
    }
  }
}
