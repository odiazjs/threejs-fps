import * as THREE from 'three';

import {
  KILLHOUSE_SHIELD_PROP_PLACEMENTS,
  KILLHOUSE_SHIELD_PROP_SCALE,
} from '../../shared/level/killhouseSmallColliders.js';
import { loadKillhouseWallTemplate } from './KillhouseWall';

const SHIELD_PROP_MODEL = 'shield_pink_prop_1.fbx';

export class KillhouseCenterProp {
  readonly group = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor() {
    this.group.name = 'killhouseCenterProp';
    this.whenReady = loadKillhouseWallTemplate(SHIELD_PROP_MODEL, KILLHOUSE_SHIELD_PROP_SCALE)
      .then((template) => {
        for (const placement of KILLHOUSE_SHIELD_PROP_PLACEMENTS) {
          const prop = template.clone(true);
          prop.rotation.y = placement.rotationY;
          prop.position.set(placement.x, 0, placement.z);
          this.group.add(prop);
        }
      })
      .catch((error) => {
        console.warn('[KillhouseCenterProp] Failed to load shield prop model', error);
      });
  }
}
