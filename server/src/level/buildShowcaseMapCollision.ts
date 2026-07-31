import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { SHOWCASE_MAP_MODEL } from '../../../shared/level/showcaseMapConfig.js';
import { prepareShowcaseMapRoot } from '../../../shared/level/showcaseMapMeshPrep.js';
import { createNodeGltfLoader } from './nodeGltfLoader.js';

/** Build a collision-marked scene from showcase_map.glb for the bake script. */
export async function buildShowcaseMapCollisionScene(
  assetDir: string,
): Promise<THREE.Group> {
  const modelPath = join(assetDir, SHOWCASE_MAP_MODEL);
  if (!existsSync(modelPath)) {
    throw new Error(`[ServerPhysics] Missing ${SHOWCASE_MAP_MODEL} in ${assetDir}`);
  }

  const loader = createNodeGltfLoader();
  const resourcePath = `${pathToFileURL(join(assetDir, '/')).href}`;
  const bytes = readFileSync(modelPath);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    resourcePath,
  );

  const root = new THREE.Group();
  root.name = 'showcase_map_collision';
  const mapRoot = gltf.scene;
  prepareShowcaseMapRoot(mapRoot);
  root.add(mapRoot);
  return root;
}
