import * as THREE from 'three';

import {
  KILLHOUSE_INTERIOR_WALL_SCALE,
  KILLHOUSE_MAZE_WALL_PLACEMENTS,
  type MazeWallPlacement,
} from '../../shared/level/killhouseMazeWalls.js';
import { loadKillhouseWallTemplate } from './KillhouseWall';

const GLASS_WALL_MODEL = 'bio_glass_wall.fbx';
const MEDIUM_WALL_MODEL = 'bio_wall_medium.fbx';

function addMazeWallInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: MazeWallPlacement,
): void {
  const wall = template.clone(true);
  wall.rotation.y = placement.rotationY;
  wall.position.set(placement.x, 0, placement.z);
  parent.add(wall);
}

export class KillhouseMazeWalls {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor() {
    this.group.name = 'killhouseMazeWalls';
    this.whenReady = this.build().catch((error) => {
      console.warn('[KillhouseMazeWalls] Failed to load maze wall models', error);
    });
  }

  private async build(): Promise<void> {
    const [glassTemplate, mediumTemplate] = await Promise.all([
      loadKillhouseWallTemplate(GLASS_WALL_MODEL, KILLHOUSE_INTERIOR_WALL_SCALE),
      loadKillhouseWallTemplate(MEDIUM_WALL_MODEL, KILLHOUSE_INTERIOR_WALL_SCALE),
    ]);

    for (const placement of KILLHOUSE_MAZE_WALL_PLACEMENTS) {
      const template = placement.kind === 'glass' ? glassTemplate : mediumTemplate;
      addMazeWallInstance(this.group, template, placement);
    }
  }
}
