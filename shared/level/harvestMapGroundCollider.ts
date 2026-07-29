import {
  HARVEST_MAP_DEPTH,
  HARVEST_MAP_GROUND_THICK,
  HARVEST_MAP_WIDTH,
} from './harvestMapConfig.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

export function loadHarvestMapGroundCollider(physics: LevelPhysicsWorld): void {
  physics.loadGroundCuboid(
    HARVEST_MAP_WIDTH * 0.5,
    HARVEST_MAP_DEPTH * 0.5,
    0,
    HARVEST_MAP_GROUND_THICK,
  );
}
