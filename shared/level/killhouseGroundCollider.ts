import {
  KILLHOUSE_DEPTH,
  KILLHOUSE_GROUND_THICK,
  KILLHOUSE_WIDTH,
} from '../level/killhouseSmallColliders.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

export function loadKillhouseGroundCollider(physics: LevelPhysicsWorld): void {
  physics.loadGroundCuboid(
    KILLHOUSE_WIDTH * 0.5,
    KILLHOUSE_DEPTH * 0.5,
    0,
    KILLHOUSE_GROUND_THICK,
  );
}
