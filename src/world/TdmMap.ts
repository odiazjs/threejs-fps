import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines';
import {
  TDM_MAP_DEPTH,
  TDM_MAP_MODEL,
  TDM_MAP_WIDTH,
} from '../../shared/level/tdmMapConfig';
import { prepareTdmMapRoot } from '../../shared/level/tdmMapMeshPrep';

const ASSET_BASE = '/3d/';
const FLOOR_COLOR = 0x6a7078;

/** The GLB's Floor material exports as transparent — swap in a plain gray. */
function applyFloorMaterial(mapRoot: THREE.Object3D): void {
  mapRoot.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh !== true || mesh.name !== 'Floor') return;

    const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of oldMaterials) material?.dispose();

    mesh.material = new THREE.MeshStandardMaterial({
      color: FLOOR_COLOR,
      roughness: 1,
      metalness: 0,
    });
  });
}

function createFallbackFloor(): THREE.Group {
  const floor = createFlatKitMesh(
    new THREE.BoxGeometry(TDM_MAP_WIDTH, 0.12, TDM_MAP_DEPTH),
    0x6a7078,
  );
  floor.position.y = -0.06;
  floor.name = 'tdm_map_fallback_floor';
  floor.traverse((child) => {
    if ((child as THREE.Mesh).isMesh === true) {
      child.userData.skipCollision = true;
    }
  });
  return floor;
}

/** Loads the Chrono-Bowl TDM arena from tdm_map.glb. */
export class TdmMap {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;
  private loaded = false;

  constructor() {
    this.group.name = 'tdmMap';
    this.whenReady = this.build();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Roots passed to client Rapier trimesh builder (bg_rock_* already skip-marked). */
  getPhysicsRoots(): THREE.Object3D[] {
    return this.loaded ? [this.group] : [];
  }

  private async build(): Promise<void> {
    const loader = new GLTFLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const gltf = await loader.loadAsync(`${ASSET_BASE}${encodeURIComponent(TDM_MAP_MODEL)}`);
      const mapRoot = gltf.scene;
      mapRoot.name = 'tdm_map';
      prepareTdmMapRoot(mapRoot);
      applyFloorMaterial(mapRoot);
      this.group.add(mapRoot);
      this.loaded = true;
      console.info(`[TdmMap] Loaded ${TDM_MAP_MODEL}`);
    } catch (error) {
      console.warn(
        `[TdmMap] ${TDM_MAP_MODEL} failed to load — using fallback floor`,
        error,
      );
      this.group.add(createFallbackFloor());
    }
  }
}
