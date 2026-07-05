import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  KILLHOUSE_CENTER_WALL_SCALE,
  PERIMETER_BIO_WALL_PLACEMENTS,
  type PerimeterBioWallPlacement,
} from '../../../shared/level/killhouseSmallColliders.js';
import {
  KILLHOUSE_LAYOUT_HOUSE_COLLISION_LOD,
  KILLHOUSE_LAYOUT_HOUSE_COLLISION_MODEL,
  KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS,
  KILLHOUSE_LAYOUT_HOUSE_SCALE,
  KILLHOUSE_LAYOUT_MEDIUM_WALL_MODEL,
  KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS,
  KILLHOUSE_LAYOUT_MEDIUM_WALL_SCALE,
  KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_LOD,
  KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_MODEL,
  KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS,
  KILLHOUSE_LAYOUT_PINK_PROP_SCALE,
  type LayoutPropPlacement,
} from '../../../shared/level/killhouseLayout.js';
import { markLodCollisionMesh, markLodCollisionShell, isThreeMesh } from '../../../shared/level/collisionMeshPrep.js';
import { keepLowestPolyFbxLodMesh, keepSingleFbxLodMesh } from '../../../shared/visuals/fbxLodUtils.js';

const BASIC_WALL_MODEL = 'bio_wall_basic.fbx';

export function installThreeNodePolyfills(): void {
  globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
  (globalThis as unknown as { URL: typeof URL }).URL ??= URL;
  if (!('createObjectURL' in URL)) {
    URL.createObjectURL = () => 'blob:mock';
  }
  globalThis.document ??= {
    createElementNS: (_ns: string, tag: string) => {
      if (tag === 'img') {
        return {
          style: {},
          setAttribute: () => undefined,
          appendChild: () => undefined,
          addEventListener: () => undefined,
        };
      }
      return {
        style: {},
        setAttribute: () => undefined,
        appendChild: () => undefined,
      };
    },
  } as unknown as Document;
  globalThis.Image ??= class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';
    constructor() {
      queueMicrotask(() => this.onload?.());
    }
  } as unknown as typeof Image;
  globalThis.Blob ??= class Blob {
    constructor(_parts?: unknown[], _options?: unknown) {}
  } as unknown as typeof Blob;
}

function getMeshCentroidXZ(model: THREE.Object3D): { x: number; z: number } {
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  const vertex = new THREE.Vector3();

  model.traverse((child) => {
    if (!isThreeMesh(child)) return;
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

function prepareWallProp(
  model: THREE.Group,
  scale: number,
  lodMode?: number | 'lowest-poly',
  shellCollision = true,
  alignXZ: 'centroid' | 'bbox' = 'centroid',
): THREE.Group {
  if (lodMode === 'lowest-poly') {
    keepLowestPolyFbxLodMesh(model);
    if (shellCollision) {
      markLodCollisionShell(model);
    } else {
      markLodCollisionMesh(model);
    }
  } else if (lodMode !== undefined) {
    keepSingleFbxLodMesh(model, lodMode);
    markLodCollisionMesh(model);
  }
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

async function loadTemplate(
  loader: FBXLoader,
  assetDir: string,
  modelFile: string,
  scale: number,
  lodMode?: number | 'lowest-poly',
  shellCollision = true,
  alignXZ: 'centroid' | 'bbox' = 'centroid',
): Promise<THREE.Group> {
  const bytes = readFileSync(join(assetDir, modelFile));
  const fbx = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), modelFile);
  return prepareWallProp(fbx as THREE.Group, scale, lodMode, shellCollision, alignXZ);
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

function addLayoutInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: LayoutPropPlacement,
): void {
  const instance = template.clone(true);
  instance.rotation.y = placement.rotationY;
  instance.position.set(placement.x, 0, placement.z);
  parent.add(instance);
}

function addHouseInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: LayoutPropPlacement & { rotationY: number },
): void {
  const house = template.clone(true);
  house.rotation.y = placement.rotationY;
  house.position.set(placement.x, 0, placement.z);
  parent.add(house);
}

/** Build the same collision hierarchy the client uses for Chrono-Bowl. */
export async function buildKillhouseCollisionScene(assetDir: string): Promise<THREE.Group> {
  const loader = new FBXLoader();
  loader.setResourcePath(`${pathToFileURL(join(assetDir, '/')).href}`);

  const root = new THREE.Group();
  root.name = 'killhouse_collision_bake';

  const [basicTemplate, mediumTemplate, houseTemplate, pinkPropTemplate] = await Promise.all([
    loadTemplate(loader, assetDir, BASIC_WALL_MODEL, KILLHOUSE_CENTER_WALL_SCALE, 'lowest-poly'),
    loadTemplate(
      loader,
      assetDir,
      KILLHOUSE_LAYOUT_MEDIUM_WALL_MODEL,
      KILLHOUSE_LAYOUT_MEDIUM_WALL_SCALE,
      'lowest-poly',
    ),
    loadTemplate(
      loader,
      assetDir,
      KILLHOUSE_LAYOUT_HOUSE_COLLISION_MODEL,
      KILLHOUSE_LAYOUT_HOUSE_SCALE,
      KILLHOUSE_LAYOUT_HOUSE_COLLISION_LOD,
      false,
      'bbox',
    ),
    loadTemplate(
      loader,
      assetDir,
      KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_MODEL,
      KILLHOUSE_LAYOUT_PINK_PROP_SCALE,
      KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_LOD,
      false,
      'bbox',
    ),
  ]);

  for (const placement of PERIMETER_BIO_WALL_PLACEMENTS) {
    addWallInstance(root, basicTemplate, placement);
  }

  for (const placement of KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS) {
    addLayoutInstance(root, mediumTemplate, placement);
  }

  for (const placement of KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS) {
    addHouseInstance(root, houseTemplate, placement);
  }

  for (const placement of KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS) {
    addLayoutInstance(root, pinkPropTemplate, placement);
  }

  root.updateWorldMatrix(true, true);
  return root;
}
