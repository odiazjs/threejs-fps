import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getKillhouseMeshCollision,
  initKillhouseMeshCollisionFromBuffer,
} from '../../../shared/level/mapMeshMovement.js';

const bakedPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../shared/level/baked/killhouse_small.collision.bin',
);

export function loadKillhouseMeshCollisionForServer(): void {
  let file: Buffer;
  try {
    file = readFileSync(bakedPath);
  } catch {
    throw new Error(
      '[ServerCollision] Missing killhouse_small.collision.bin — run `npm run bake:collision` from the repo root',
    );
  }
  initKillhouseMeshCollisionFromBuffer(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
  const collision = getKillhouseMeshCollision();
  if (!collision?.isReady) {
    throw new Error('[ServerCollision] Failed to load baked Chrono-Bowl mesh collision');
  }
  console.info('[ServerCollision] Loaded baked Chrono-Bowl mesh collision');
}
