import {
  TDM_MAP_DEPTH,
  TDM_MAP_GROUND_THICK,
  TDM_MAP_WIDTH,
} from './tdmMapConfig.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

export function loadTdmMapGroundCollider(physics: LevelPhysicsWorld): void {
  physics.loadGroundCuboid(
    TDM_MAP_WIDTH * 0.5,
    TDM_MAP_DEPTH * 0.5,
    0,
    TDM_MAP_GROUND_THICK,
  );
}
