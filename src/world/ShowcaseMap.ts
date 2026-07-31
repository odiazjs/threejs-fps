import * as THREE from 'three';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines';
import { createGltfLoader } from '../content/gltfLoader';
import {
  SHOWCASE_MAP_DEPTH,
  SHOWCASE_MAP_MODEL,
  SHOWCASE_MAP_WIDTH,
} from '../../shared/level/showcaseMapConfig';
import { prepareShowcaseMapRoot } from '../../shared/level/showcaseMapMeshPrep';
import {
  configureColorTexture,
  optimizeObjectTextures,
} from '../content/textureQuality';

const ASSET_BASE = '/3d/';
const FLOOR_COLOR = 0x6a7078;

function createFallbackFloor(): THREE.Group {
  const floor = createFlatKitMesh(
    new THREE.BoxGeometry(SHOWCASE_MAP_WIDTH, 0.12, SHOWCASE_MAP_DEPTH),
    FLOOR_COLOR,
  );
  floor.position.y = -0.06;
  floor.name = 'showcase_map_fallback_floor';
  floor.traverse((child) => {
    if ((child as THREE.Mesh).isMesh === true) {
      child.userData.skipCollision = true;
    }
  });
  return floor;
}

function pickAlbedoMap(material: THREE.Material): THREE.Texture | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
  ) {
    return material.map ?? material.emissiveMap ?? null;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map ?? null;
  }
  return null;
}

function pickAlbedoColor(material: THREE.Material): number {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshBasicMaterial
  ) {
    const hex = material.color.getHex();
    // Meshy kits often use black base + albedo on emissiveMap — lift to white.
    return hex === 0 ? 0xffffff : hex;
  }
  return 0x6a7078;
}

/** Authored floor mesh — keep GLB materials as-authored. */
function isShowcaseFloorMesh(mesh: THREE.Mesh): boolean {
  return mesh.name.trim().toLowerCase() === 'floor';
}

/** Flat unlit materials — no lighting response, specular, or emissive glow. */
function applyShowcaseFlatMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    // Preserve the authored Floor material (do not convert or dispose it).
    if (isShowcaseFloorMesh(child)) return;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      const map = pickAlbedoMap(source);
      if (map) configureColorTexture(map);
      const flat = new THREE.MeshBasicMaterial({
        color: pickAlbedoColor(source),
        map: map ?? undefined,
        transparent: source.transparent,
        opacity: source.opacity,
        side: source.side,
        depthWrite: source.depthWrite,
        depthTest: source.depthTest,
      });
      source.dispose();
      return flat;
    });
    child.material = next.length === 1 ? next[0]! : next;
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

/** Loads the Showcase arena from showcase_map.glb. */
export class ShowcaseMap {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;
  private loaded = false;

  constructor() {
    this.group.name = 'showcaseMap';
    this.whenReady = this.build();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  getPhysicsRoots(): THREE.Object3D[] {
    return this.loaded ? [this.group] : [];
  }

  private async build(): Promise<void> {
    const loader = createGltfLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const gltf = await loader.loadAsync(
        `${ASSET_BASE}${encodeURIComponent(SHOWCASE_MAP_MODEL)}`,
      );
      const mapRoot = gltf.scene;
      mapRoot.name = 'showcase_map';
      prepareShowcaseMapRoot(mapRoot);
      applyShowcaseFlatMaterials(mapRoot);
      optimizeObjectTextures(mapRoot);
      this.group.add(mapRoot);
      this.loaded = true;
      console.info(`[ShowcaseMap] Loaded ${SHOWCASE_MAP_MODEL}`);
    } catch (error) {
      console.warn(
        `[ShowcaseMap] ${SHOWCASE_MAP_MODEL} failed to load — using fallback floor`,
        error,
      );
      this.group.add(createFallbackFloor());
    }
  }
}
