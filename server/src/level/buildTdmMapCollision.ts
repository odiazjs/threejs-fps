import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { TDM_MAP_MODEL } from '../../../shared/level/tdmMapConfig.js';
import { prepareTdmMapRoot } from '../../../shared/level/tdmMapMeshPrep.js';
import { createNodeGltfLoader } from './nodeGltfLoader.js';

/** Build a collision-marked scene from tdm_map.glb for the bake script. */
export async function buildTdmMapCollisionScene(assetDir: string): Promise<THREE.Group> {
  const modelPath = join(assetDir, TDM_MAP_MODEL);
  if (!existsSync(modelPath)) {
    throw new Error(`[ServerPhysics] Missing ${TDM_MAP_MODEL} in ${assetDir}`);
  }

  const loader = createNodeGltfLoader();
  const resourcePath = `${pathToFileURL(join(assetDir, '/')).href}`;
  const bytes = readFileSync(modelPath);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    resourcePath,
  );

  const root = new THREE.Group();
  root.name = 'tdm_map_collision';
  const mapRoot = gltf.scene;
  prepareTdmMapRoot(mapRoot);
  root.add(mapRoot);
  return root;
}
