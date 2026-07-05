import * as THREE from 'three';
import {
  KILLHOUSE_LAYOUT_MEDIUM_WALL_MODEL,
  KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS,
  KILLHOUSE_LAYOUT_MEDIUM_WALL_SCALE,
  type LayoutPropPlacement,
} from '../../shared/level/killhouseLayout.js';
import { loadKillhouseWallTemplate } from './KillhouseWall';

function addWallInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: LayoutPropPlacement,
): void {
  const wall = template.clone(true);
  wall.rotation.y = placement.rotationY;
  wall.position.set(placement.x, 0, placement.z);
  parent.add(wall);
}

/** Interior bio_wall_medium cover from the Chrono-Bowl layout map. */
export class KillhouseLayoutWalls {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor() {
    this.group.name = 'killhouseLayoutWalls';
    this.whenReady = this.build().catch((error) => {
      console.warn('[KillhouseLayoutWalls] Failed to load interior wall models', error);
    });
  }

  private async build(): Promise<void> {
    const template = await loadKillhouseWallTemplate(
      KILLHOUSE_LAYOUT_MEDIUM_WALL_MODEL,
      KILLHOUSE_LAYOUT_MEDIUM_WALL_SCALE,
    );

    for (const placement of KILLHOUSE_LAYOUT_MEDIUM_WALL_PLACEMENTS) {
      addWallInstance(this.group, template, placement);
    }
  }
}
