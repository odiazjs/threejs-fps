import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines';
import {
  HARVEST_MAP_DEPTH,
  HARVEST_MAP_MODEL,
  HARVEST_MAP_WIDTH,
  isHarvestMapTeamBaseName,
} from '../../shared/level/harvestMapConfig';
import {
  extractHarvestMapCraftingStationSpawns,
  extractHarvestMapHarvestingBoxSpawns,
  extractHarvestMapTeamBaseAnchors,
  extractHarvestMapHillWallAnchors,
  prepareHarvestMapRoot,
} from '../../shared/level/harvestMapMeshPrep';
import type { CraftingStationSpawn } from '../../shared/level/craftingStationSpawns';
import type { HarvestingBoxSpawn } from '../../shared/level/harvestingBoxSpawns';
import { configureColorTexture, optimizeObjectTextures } from '../content/textureQuality';
import { createTeamBaseMesh } from './teamBaseVisual';
import { createHillWallMesh } from './hillWallVisual';

const ASSET_BASE = '/3d/';
/** Fallback when Floor has no texture (matches authored solid). */
const FLOOR_SOLID_COLOR = 0x9a8860;

function pickEmissiveTexture(material: THREE.Material): THREE.Texture | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    return material.emissiveMap ?? material.map ?? null;
  }
  if (
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
  ) {
    return material.emissiveMap ?? material.map ?? null;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map ?? null;
  }
  return null;
}

/**
 * Harvest props are Meshy-authored: black color/specular, emissive 1.0,
 * albedo on emissiveMap. Some GLB exports leave the texture on `map` with
 * white emissive, which washes out under Chrono lighting ù normalize here.
 */
function toMeshyEmissiveMaterial(
  source: THREE.Material,
  options: { solidEmissive?: number } = {},
): THREE.MeshPhongMaterial {
  const emissiveMap = pickEmissiveTexture(source);
  if (emissiveMap) {
    configureColorTexture(emissiveMap);
  }

  const solid = options.solidEmissive;
  const emissiveColor = emissiveMap != null ? 0xffffff : (solid ?? 0x000000);

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

function isFloorObject(object: THREE.Object3D): boolean {
  return object.name.toLowerCase() === 'floor';
}

function applyHarvestMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const isFloor = isFloorObject(child) || isFloorObject(child.parent ?? child);
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      let solid: number | undefined;
      if (isFloor && source instanceof THREE.MeshStandardMaterial && !source.map) {
        solid = source.color.getHex();
      } else if (isFloor) {
        solid = FLOOR_SOLID_COLOR;
      }
      const converted = toMeshyEmissiveMaterial(source, {
        solidEmissive: solid,
      });
      source.dispose();
      return converted;
    });
    child.material = next.length === 1 ? next[0]! : next;
  });
}

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
    const loader = new GLTFLoader();
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
      applyHarvestMaterials(mapRoot);
      optimizeObjectTextures(mapRoot);
      this.group.add(mapRoot);
      await this.spawnTeamBaseFbxs(mapRoot);
      await this.replaceHillWallFbx(mapRoot);
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

  /** Place Meshy team-base FBXs on `team_blue_base` / `team_orange_base` markers. */
  private async spawnTeamBaseFbxs(mapRoot: THREE.Object3D): Promise<void> {
    let hasMarkers = false;
    mapRoot.traverse((child) => {
      if (isHarvestMapTeamBaseName(child.name)) hasMarkers = true;
    });
    if (!hasMarkers) {
      console.warn(
        '[HarvestMap] No team_blue_base / team_orange_base markers ó using fallback poses',
      );
    }

    const anchors = extractHarvestMapTeamBaseAnchors(mapRoot);
    for (const anchor of anchors) {
      try {
        const mesh = await createTeamBaseMesh(anchor.teamId, anchor.size.y);
        const root = new THREE.Group();
        root.name =
          anchor.teamId === 0 ? 'teamBaseBlueFbx' : 'teamBaseOrangeFbx';
        root.add(mesh);

        // Feet of normalized mesh are at local y=0 ó sit on marker ground.
        root.position.set(anchor.position.x, anchor.groundY, anchor.position.z);
        root.quaternion.copy(anchor.quaternion);
        root.updateMatrixWorld(true);

        const placed = new THREE.Box3().setFromObject(root);
        if (Number.isFinite(placed.min.y)) {
          root.position.y -= placed.min.y - anchor.groundY;
        }

        this.group.add(root);
        console.info(
          `[HarvestMap] Placed team ${anchor.teamId === 0 ? 'blue' : 'orange'} base FBX ` +
            `(h=${anchor.size.y.toFixed(2)} at ${anchor.position.x.toFixed(1)},${anchor.position.z.toFixed(1)})`,
        );
      } catch (error) {
        console.warn(
          `[HarvestMap] Failed to load team base FBX (team ${anchor.teamId})`,
          error,
        );
      }
    }
  }

  /**
   * Replace authored `hill_wall` with Meshy FBX at the same world center,
   * quaternion, and matched uniform scale.
   */
  private async replaceHillWallFbx(mapRoot: THREE.Object3D): Promise<void> {
    const anchors = extractHarvestMapHillWallAnchors(mapRoot);
    if (anchors.length === 0) {
      console.warn('[HarvestMap] No hill_wall object found ù skip FBX replace');
      return;
    }

    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!;
      try {
        const mesh = await createHillWallMesh(anchor.size);
        const root = new THREE.Group();
        root.name = anchors.length === 1 ? 'hillWallFbx' : `hillWallFbx_${i}`;
        root.add(mesh);
        root.position.copy(anchor.position);
        root.quaternion.copy(anchor.quaternion);
        root.updateMatrixWorld(true);

        const placed = new THREE.Box3().setFromObject(root);
        if (!placed.isEmpty()) {
          const center = placed.getCenter(new THREE.Vector3());
          root.position.add(anchor.position.clone().sub(center));
        }

        this.group.add(root);
        console.info(
          `[HarvestMap] Replaced hill_wall with FBX ` +
            `(size ${anchor.size.x.toFixed(1)}x${anchor.size.y.toFixed(1)}x${anchor.size.z.toFixed(1)})`,
        );
      } catch (error) {
        console.warn('[HarvestMap] Failed to load hill_wall.fbx', error);
      }
    }
  }
}
