import {
  KILLHOUSE_FLAT_HOUSE_COLLISION_LOD,
  KILLHOUSE_FLAT_HOUSE_COLLISION_MODEL,
  KILLHOUSE_FLAT_HOUSE_POSITION,
  KILLHOUSE_FLAT_HOUSE_SCALE,
  KILLHOUSE_FLAT_HOUSE_VISUAL_LOD,
  KILLHOUSE_FLAT_HOUSE_VISUAL_MODEL,
} from '../../shared/level/killhouseSmallColliders.js';
import { KillhousePropHouse } from './KillhousePropHouse';

export class KillhouseFlatHouse extends KillhousePropHouse {
  constructor() {
    super({
      name: 'flat',
      visualModel: KILLHOUSE_FLAT_HOUSE_VISUAL_MODEL,
      collisionModel: KILLHOUSE_FLAT_HOUSE_COLLISION_MODEL,
      scale: KILLHOUSE_FLAT_HOUSE_SCALE,
      visualLod: KILLHOUSE_FLAT_HOUSE_VISUAL_LOD,
      collisionLod: KILLHOUSE_FLAT_HOUSE_COLLISION_LOD,
      shellCollision: false,
      position: KILLHOUSE_FLAT_HOUSE_POSITION,
    });
  }
}
