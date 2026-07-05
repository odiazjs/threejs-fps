import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  KILLHOUSE_CENTER_WALL_SCALE,
  KILLHOUSE_DEPTH,
  KILLHOUSE_SHIELD_PROP_PLACEMENTS,
  KILLHOUSE_SHIELD_PROP_SCALE,
  KILLHOUSE_WIDTH,
  PERIMETER_BIO_WALL_PLACEMENTS,
  type PerimeterBioWallPlacement,
} from '../../shared/level/killhouseSmallColliders.js';
import {
  KILLHOUSE_INTERIOR_WALL_SCALE,
  KILLHOUSE_MAZE_WALL_PLACEMENTS,
  type MazeWallPlacement,
} from '../../shared/level/killhouseMazeWalls.js';

const BASIC_WALL_MODEL = 'bio_wall_basic.fbx';
const GLASS_WALL_MODEL = 'bio_glass_wall.fbx';
const MEDIUM_WALL_MODEL = 'bio_wall_medium.fbx';
const SHIELD_PROP_MODEL = 'shield_pink_prop_1.fbx';

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

function prepareWallProp(model: THREE.Group, scale: number): THREE.Group {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const centroid = getMeshCentroidXZ(model);
  model.position.x -= centroid.x;
  model.position.z -= centroid.z;
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
): Promise<THREE.Group> {
  const bytes = readFileSync(join(assetDir, modelFile));
  const fbx = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), modelFile);
  return prepareWallProp(fbx as THREE.Group, scale);
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

function addMazeWallInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: MazeWallPlacement,
): void {
  const wall = template.clone(true);
  wall.rotation.y = placement.rotationY;
  wall.position.set(placement.x, 0, placement.z);
  parent.add(wall);
}

function addFloor(parent: THREE.Group): void {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(KILLHOUSE_WIDTH, 0.12, KILLHOUSE_DEPTH),
    new THREE.MeshBasicMaterial({ color: 0x8a9098 }),
  );
  floor.position.y = -0.06;
  parent.add(floor);
}

/** Build the same collision hierarchy the client uses for Chrono-Bowl mesh BVH. */
export async function buildKillhouseCollisionScene(assetDir: string): Promise<THREE.Group> {
  const loader = new FBXLoader();
  loader.setResourcePath(`${pathToFileURL(join(assetDir, '/')).href}`);

  const root = new THREE.Group();
  root.name = 'killhouse_collision_bake';

  addFloor(root);

  const [basicTemplate, glassTemplate, mediumTemplate, shieldTemplate] = await Promise.all([
    loadTemplate(loader, assetDir, BASIC_WALL_MODEL, KILLHOUSE_CENTER_WALL_SCALE),
    loadTemplate(loader, assetDir, GLASS_WALL_MODEL, KILLHOUSE_INTERIOR_WALL_SCALE),
    loadTemplate(loader, assetDir, MEDIUM_WALL_MODEL, KILLHOUSE_INTERIOR_WALL_SCALE),
    loadTemplate(loader, assetDir, SHIELD_PROP_MODEL, KILLHOUSE_SHIELD_PROP_SCALE),
  ]);

  for (const placement of PERIMETER_BIO_WALL_PLACEMENTS) {
    addWallInstance(root, basicTemplate, placement);
  }

  for (const placement of KILLHOUSE_MAZE_WALL_PLACEMENTS) {
    const template = placement.kind === 'glass' ? glassTemplate : mediumTemplate;
    addMazeWallInstance(root, template, placement);
  }

  for (const placement of KILLHOUSE_SHIELD_PROP_PLACEMENTS) {
    const prop = shieldTemplate.clone(true);
    prop.rotation.y = placement.rotationY;
    prop.position.set(placement.x, 0, placement.z);
    root.add(prop);
  }

  root.updateWorldMatrix(true, true);
  return root;
}
