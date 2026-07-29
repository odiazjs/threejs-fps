import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  KILLHOUSE_CENTER_WALL_SCALE,
  PERIMETER_BIO_WALL_PLACEMENTS,
  type PerimeterBioWallPlacement,
} from '../../shared/level/killhouseSmallColliders.js';
import { markLodCollisionMesh, markLodCollisionShell } from '../../shared/level/collisionMeshPrep.js';
import { keepLowestPolyFbxLodMesh, keepSingleFbxLodMesh } from '../../shared/visuals/fbxLodUtils.js';
import { optimizeObjectTextures } from '../content/textureQuality';

const WALL_ASSET_BASE = '/3d/';
const BASIC_WALL_MODEL = 'bio_wall_basic.fbx';

const templateCache = new Map<string, Promise<THREE.Group>>();

function normalizeModelFile(modelPath: string): string {
  if (modelPath.startsWith('public/3d/')) {
    return modelPath.slice('public/3d/'.length);
  }
  if (modelPath.startsWith('/3d/')) {
    return modelPath.slice('/3d/'.length);
  }
  return modelPath;
}

function getAlignXZ(
  model: THREE.Object3D,
  mode: 'centroid' | 'bbox',
): { x: number; z: number } {
  if (mode === 'bbox') {
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    return { x: center.x, z: center.z };
  }
  return getMeshCentroidXZ(model);
}

function getMeshCentroidXZ(model: THREE.Object3D): { x: number; z: number } {
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  const vertex = new THREE.Vector3();

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const positions = child.geometry.attributes.position;
    if (!positions) return;

    child.updateWorldMatrix(true, false);
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld);
      sumX += vertex.x;
      sumZ += vertex.z;
      count++;
    }
  });

  if (count === 0) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    return { x: center.x, z: center.z };
  }

  return { x: sumX / count, z: sumZ / count };
}

export interface LoadLodOptions {
  /** When false, use the LOD mesh verbatim (for pre-authored collision hulls). Default true for lowest-poly. */
  shellCollision?: boolean;
  /** bbox = stable across LOD siblings; centroid = legacy wall tiling. */
  alignXZ?: 'centroid' | 'bbox';
}

function prepareWallProp(
  model: THREE.Group,
  scale: number,
  lodMode?: number | 'lowest-poly',
  options: LoadLodOptions = {},
): THREE.Group {
  const alignXZ = options.alignXZ ?? 'centroid';
  if (lodMode === 'lowest-poly') {
    keepLowestPolyFbxLodMesh(model);
    if (options.shellCollision !== false) {
      markLodCollisionShell(model);
    } else {
      markLodCollisionMesh(model);
    }
  } else if (lodMode !== undefined) {
    keepSingleFbxLodMesh(model, lodMode);
    markLodCollisionMesh(model);
  }
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const anchor = getAlignXZ(model, alignXZ);
  model.position.x -= anchor.x;
  model.position.z -= anchor.z;
  model.position.y -= box.min.y;

  const wrapper = new THREE.Group();
  wrapper.name = 'killhouseWallModule';
  wrapper.add(model);
  wrapper.scale.setScalar(scale);
  return wrapper;
}

export function loadKillhouseWallTemplate(
  modelPath: string,
  scale = KILLHOUSE_CENTER_WALL_SCALE,
  lodMode?: number | 'lowest-poly',
  options: LoadLodOptions = {},
): Promise<THREE.Group> {
  const modelFile = normalizeModelFile(modelPath);
  const cacheKey = `${modelFile}:${scale}:${lodMode ?? 'all'}:${options.shellCollision ?? 'default'}:${options.alignXZ ?? 'centroid'}`;
  const cached = templateCache.get(cacheKey);
  if (cached) return cached;

  const loadPromise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(WALL_ASSET_BASE);
    const fbx = await loader.loadAsync(`${WALL_ASSET_BASE}${encodeURIComponent(modelFile)}`);
    const prepared = prepareWallProp(fbx as THREE.Group, scale, lodMode, options);
    optimizeObjectTextures(prepared);
    return prepared;
  })();

  templateCache.set(cacheKey, loadPromise);
  return loadPromise;
}

function addWallInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: PerimeterBioWallPlacement,
): void {
  const wall = template.clone(true);
  wall.rotation.y = placement.rotationY;
  wall.position.set(placement.x, 0, placement.z);
  parent.add(wall);
}

export class KillhouseWall {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor() {
    this.group.name = 'killhouseWalls';
    this.whenReady = this.build().catch((error) => {
      console.warn('[KillhouseWall] Failed to load wall models', error);
    });
  }

  private async build(): Promise<void> {
    const basicTemplate = await loadKillhouseWallTemplate(BASIC_WALL_MODEL);

    for (const placement of PERIMETER_BIO_WALL_PLACEMENTS) {
      addWallInstance(this.group, basicTemplate, placement);
    }
  }
}
