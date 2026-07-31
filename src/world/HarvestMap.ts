import * as THREE from 'three';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines';
import { createGltfLoader } from '../content/gltfLoader';
import {
  HARVEST_MAP_DEPTH,
  HARVEST_MAP_MODEL,
  HARVEST_MAP_WIDTH,
} from '../../shared/level/harvestMapConfig';
import {
  extractHarvestMapCraftingStationSpawns,
  extractHarvestMapHarvestingBoxSpawns,
  prepareHarvestMapRoot,
} from '../../shared/level/harvestMapMeshPrep';
import type { CraftingStationSpawn } from '../../shared/level/craftingStationSpawns';
import type { HarvestingBoxSpawn } from '../../shared/level/harvestingBoxSpawns';
import {
  configureColorTexture,
  optimizeObjectTextures,
} from '../content/textureQuality';

const ASSET_BASE = '/3d/';
/** Fallback when Floor has no texture (matches authored solid). */
const FLOOR_SOLID_COLOR = 0x6a7078;

function createFallbackFloor(): THREE.Group {
  const floor = createFlatKitMesh(
    new THREE.BoxGeometry(HARVEST_MAP_WIDTH, 0.12, HARVEST_MAP_DEPTH),
    FLOOR_SOLID_COLOR,
  );
  floor.position.y = -0.06;
  floor.name = 'harvest_map_fallback_floor';
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
    return hex === 0 ? 0xffffff : hex;
  }
  return FLOOR_SOLID_COLOR;
}

/** Authored floor mesh ? keep GLB materials as-authored. */
function isHarvestFloorMesh(mesh: THREE.Mesh): boolean {
  return mesh.name.trim().toLowerCase() === 'floor';
}

/** Flat unlit materials ? no lighting response, specular, or emissive glow. */
function applyHarvestFlatMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (isHarvestFloorMesh(child)) return;
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

/** Loads the Plasma Harvest arena from harvest_map.glb. */
export class HarvestMap {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;
  private loaded = false;
  private craftingStationSpawns: readonly CraftingStationSpawn[] = [];
  private harvestingBoxSpawns: readonly HarvestingBoxSpawn[] = [];

  constructor() {
    this.group.name = 'harvestMap';
    this.whenReady = this.build();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  getCraftingStationSpawns(): readonly CraftingStationSpawn[] {
    return this.craftingStationSpawns;
  }

  getHarvestingBoxSpawns(): readonly HarvestingBoxSpawn[] {
    return this.harvestingBoxSpawns;
  }

  getPhysicsRoots(): THREE.Object3D[] {
    return this.loaded ? [this.group] : [];
  }

  private async build(): Promise<void> {
    const loader = createGltfLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const gltf = await loader.loadAsync(
        `${ASSET_BASE}${encodeURIComponent(HARVEST_MAP_MODEL)}`,
      );
      const mapRoot = gltf.scene;
      mapRoot.name = 'harvest_map';
      prepareHarvestMapRoot(mapRoot);
      this.craftingStationSpawns = extractHarvestMapCraftingStationSpawns(mapRoot);
      this.harvestingBoxSpawns = extractHarvestMapHarvestingBoxSpawns(mapRoot);
      applyHarvestFlatMaterials(mapRoot);
      optimizeObjectTextures(mapRoot);
      this.group.add(mapRoot);
      this.loaded = true;
      console.info(
        `[HarvestMap] Loaded ${HARVEST_MAP_MODEL} (${this.craftingStationSpawns.length} craft markers, ${this.harvestingBoxSpawns.length} box markers)`,
      );
    } catch (error) {
      console.warn(
        `[HarvestMap] ${HARVEST_MAP_MODEL} failed to load - using fallback floor`,
        error,
      );
      this.group.add(createFallbackFloor());
    }
  }
}
