import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { HARVEST_MAP_MODEL } from '../../../shared/level/harvestMapConfig.js';
import { prepareHarvestMapRoot } from '../../../shared/level/harvestMapMeshPrep.js';
import { createNodeGltfLoader } from './nodeGltfLoader.js';

/** Build a collision-marked scene from harvest_map.glb for the bake script. */
export async function buildHarvestMapCollisionScene(
  assetDir: string,
): Promise<THREE.Group> {
  const modelPath = join(assetDir, HARVEST_MAP_MODEL);
  if (!existsSync(modelPath)) {
    throw new Error(`[ServerPhysics] Missing ${HARVEST_MAP_MODEL} in ${assetDir}`);
  }

  const loader = createNodeGltfLoader();
  const resourcePath = `${pathToFileURL(join(assetDir, '/')).href}`;
  const bytes = readFileSync(modelPath);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    resourcePath,
  );

  const root = new THREE.Group();
  root.name = 'harvest_map_collision';
  const mapRoot = gltf.scene;
  prepareHarvestMapRoot(mapRoot);
  root.add(mapRoot);
  return root;
}
