import * as THREE from 'three';
import {
  KILLHOUSE_LAYOUT_HOUSE_COLLISION_LOD,
  KILLHOUSE_LAYOUT_HOUSE_COLLISION_MODEL,
  KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS,
  KILLHOUSE_LAYOUT_HOUSE_SCALE,
  KILLHOUSE_LAYOUT_HOUSE_VISUAL_LOD,
  KILLHOUSE_LAYOUT_HOUSE_VISUAL_MODEL,
} from '../../shared/level/killhouseLayout.js';
import { KillhousePropHouse } from './KillhousePropHouse';

/** All Chrono-Bowl enterable house_flat instances. */
export class KillhouseLayoutHouses {
  readonly houses: KillhousePropHouse[] = [];
  readonly whenReady: Promise<void>;

  constructor() {
    this.houses = KILLHOUSE_LAYOUT_HOUSE_PLACEMENTS.map(
      (placement) =>
        new KillhousePropHouse({
          name: placement.id,
          visualModel: KILLHOUSE_LAYOUT_HOUSE_VISUAL_MODEL,
          collisionModel: KILLHOUSE_LAYOUT_HOUSE_COLLISION_MODEL,
          scale: KILLHOUSE_LAYOUT_HOUSE_SCALE,
          visualLod: KILLHOUSE_LAYOUT_HOUSE_VISUAL_LOD,
          collisionLod: KILLHOUSE_LAYOUT_HOUSE_COLLISION_LOD,
          shellCollision: false,
          position: { x: placement.x, z: placement.z },
          rotationY: placement.rotationY,
        }),
    );
    this.whenReady = Promise.all(this.houses.map((house) => house.whenReady)).then(() => undefined);
  }

  get groups(): THREE.Group[] {
    return this.houses.flatMap((house) => [house.group, house.collisionGroup]);
  }

  get collisionGroups(): THREE.Group[] {
    return this.houses.map((house) => house.collisionGroup);
  }
}
