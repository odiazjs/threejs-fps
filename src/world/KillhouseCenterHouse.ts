import * as THREE from 'three';

import {
  KILLHOUSE_CENTER_HOUSE_COLLISION_MODEL,
  KILLHOUSE_CENTER_HOUSE_SCALE,
  KILLHOUSE_CENTER_HOUSE_VISUAL_LOD,
  KILLHOUSE_CENTER_HOUSE_VISUAL_MODEL,
} from '../../shared/level/killhouseSmallColliders.js';
import { loadKillhouseWallTemplate } from './KillhouseWall';

export class KillhouseCenterHouse {
  readonly group = new THREE.Group();
  /** Invisible LOD hull — merged into mesh BVH with automatic shell extraction. */
  readonly collisionGroup = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor() {
    this.group.name = 'killhouseCenterHouse';
    this.collisionGroup.name = 'killhouseCenterHouseCollision';
    this.collisionGroup.visible = false;

    this.whenReady = Promise.all([
      loadKillhouseWallTemplate(
        KILLHOUSE_CENTER_HOUSE_VISUAL_MODEL,
        KILLHOUSE_CENTER_HOUSE_SCALE,
        KILLHOUSE_CENTER_HOUSE_VISUAL_LOD,
      )
        .then((template) => {
          const house = template.clone(true);
          house.position.set(0, 0, 0);
          this.group.add(house);
        }),
      loadKillhouseWallTemplate(
        KILLHOUSE_CENTER_HOUSE_COLLISION_MODEL,
        KILLHOUSE_CENTER_HOUSE_SCALE,
        'lowest-poly',
      )
        .then((template) => {
          const house = template.clone(true);
          house.position.set(0, 0, 0);
          this.collisionGroup.add(house);
        }),
    ])
      .then(() => undefined)
      .catch((error) => {
        console.warn('[KillhouseCenterHouse] Failed to load center house model', error);
      });
  }
}
