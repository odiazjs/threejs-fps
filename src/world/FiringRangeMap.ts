import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines';
import {
  FIRING_RANGE_DEPTH,
  FIRING_RANGE_MODEL,
  FIRING_RANGE_WIDTH,
} from '../../shared/level/firingRangeConfig';
import {
  prepareFiringRangeMapRoot,
} from '../../shared/level/firingRangeMeshPrep';

const ASSET_BASE = '/3d/';

function createFallbackFloor(): THREE.Group {
  const floor = createFlatKitMesh(
    new THREE.BoxGeometry(FIRING_RANGE_WIDTH, 0.12, FIRING_RANGE_DEPTH),
    0x6a7078,
  );
  floor.position.y = -0.06;
  floor.name = 'firing_range_fallback_floor';
  floor.traverse((child) => {
    if ((child as THREE.Mesh).isMesh === true) {
      child.userData.skipCollision = true;
    }
  });
  return floor;
}

/** Loads firing_range_map.glb from the three.js editor export pipeline. */
export class FiringRangeMap {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;
  private loaded = false;

  constructor() {
    this.group.name = 'firingRangeMap';
    this.whenReady = this.build();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Roots passed to client Rapier trimesh builder. */
  getPhysicsRoots(): THREE.Object3D[] {
    return this.loaded ? [this.group] : [];
  }

  private async build(): Promise<void> {
    const loader = new GLTFLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const gltf = await loader.loadAsync(`${ASSET_BASE}${encodeURIComponent(FIRING_RANGE_MODEL)}`);
      const mapRoot = gltf.scene;
      mapRoot.name = 'firing_range_map';
      prepareFiringRangeMapRoot(mapRoot);
      this.group.add(mapRoot);
      this.loaded = true;
      console.info(`[FiringRange] Loaded ${FIRING_RANGE_MODEL}`);
    } catch (error) {
      console.warn(
        `[FiringRange] ${FIRING_RANGE_MODEL} not found yet — using fallback floor until you add the GLB to 3d/`,
        error,
      );
      this.group.add(createFallbackFloor());
    }
  }
}
