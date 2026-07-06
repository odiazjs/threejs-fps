import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';
import { getFiringRangeCrateColliders } from './firingRangeCrateColliders.js';

export function loadFiringRangeCrateColliders(physics: LevelPhysicsWorld): number {
  const crates = getFiringRangeCrateColliders();
  if (crates.length === 0) return 0;

  physics.loadAABBs(crates);
  return crates.length;
}
