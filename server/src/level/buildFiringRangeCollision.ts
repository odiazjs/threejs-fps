import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FIRING_RANGE_MODEL } from '../../../shared/level/firingRangeConfig.js';
import {
  prepareFiringRangeMapRoot,
} from '../../../shared/level/firingRangeMeshPrep.js';
import { createNodeGltfLoader } from './nodeGltfLoader.js';

export function installThreeNodePolyfills(): void {
  globalThis.self ??= globalThis as unknown as Window & typeof globalThis;
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
  globalThis.createImageBitmap ??= (async () => ({
    width: 1,
    height: 1,
    close: () => undefined,
  })) as unknown as typeof createImageBitmap;
}

/** Build server-side collision hierarchy from firing_range_map.glb. */
export async function buildFiringRangeCollisionScene(assetDir: string): Promise<THREE.Group> {
  const modelPath = join(assetDir, FIRING_RANGE_MODEL);
  if (!existsSync(modelPath)) {
    throw new Error(`[ServerPhysics] Missing ${FIRING_RANGE_MODEL} in ${assetDir}`);
  }

  const loader = createNodeGltfLoader();
  const resourcePath = `${pathToFileURL(join(assetDir, '/')).href}`;
  const bytes = readFileSync(modelPath);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    resourcePath,
  );

  const root = new THREE.Group();
  root.name = 'firing_range_collision';
  const mapRoot = gltf.scene;
  prepareFiringRangeMapRoot(mapRoot);
  root.add(mapRoot);
  return root;
}
