import {
  FIRING_RANGE_DEPTH,
  FIRING_RANGE_GROUND_THICK,
  FIRING_RANGE_WIDTH,
} from './firingRangeConfig.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

export function loadFiringRangeGroundCollider(physics: LevelPhysicsWorld): void {
  physics.loadGroundCuboid(
    FIRING_RANGE_WIDTH * 0.5,
    FIRING_RANGE_DEPTH * 0.5,
    0,
    FIRING_RANGE_GROUND_THICK,
  );
}
