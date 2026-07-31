import {
  SHOWCASE_MAP_DEPTH,
  SHOWCASE_MAP_GROUND_THICK,
  SHOWCASE_MAP_WIDTH,
} from './showcaseMapConfig.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

export function loadShowcaseMapGroundCollider(physics: LevelPhysicsWorld): void {
  physics.loadGroundCuboid(
    SHOWCASE_MAP_WIDTH * 0.5,
    SHOWCASE_MAP_DEPTH * 0.5,
    0,
    SHOWCASE_MAP_GROUND_THICK,
  );
}
