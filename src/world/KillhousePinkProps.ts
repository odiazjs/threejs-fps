import * as THREE from 'three';
import {
  KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_LOD,
  KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_MODEL,
  KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS,
  KILLHOUSE_LAYOUT_PINK_PROP_SCALE,
  KILLHOUSE_LAYOUT_PINK_PROP_VISUAL_MODEL,
  type LayoutPropPlacement,
} from '../../shared/level/killhouseLayout.js';
import { loadKillhouseWallTemplate } from './KillhouseWall';

function addPropInstance(
  parent: THREE.Group,
  template: THREE.Group,
  placement: LayoutPropPlacement,
): void {
  const prop = template.clone(true);
  prop.rotation.y = placement.rotationY;
  prop.position.set(placement.x, 0, placement.z);
  parent.add(prop);
}

/** shield_pink_prop_1 visuals + lod_shield_prop collision from layout map. */
export class KillhousePinkProps {
  readonly group = new THREE.Group();
  readonly collisionGroup = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor() {
    this.group.name = 'killhousePinkProps';
    this.collisionGroup.name = 'killhousePinkPropsCollision';
    this.collisionGroup.visible = false;

    this.whenReady = this.build().catch((error) => {
      console.warn('[KillhousePinkProps] Failed to load pink prop models', error);
    });
  }

  private async build(): Promise<void> {
    const [visualTemplate, collisionTemplate] = await Promise.all([
      loadKillhouseWallTemplate(
        KILLHOUSE_LAYOUT_PINK_PROP_VISUAL_MODEL,
        KILLHOUSE_LAYOUT_PINK_PROP_SCALE,
        undefined,
        { alignXZ: 'bbox' },
      ),
      loadKillhouseWallTemplate(
        KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_MODEL,
        KILLHOUSE_LAYOUT_PINK_PROP_SCALE,
        KILLHOUSE_LAYOUT_PINK_PROP_COLLISION_LOD,
        { shellCollision: false, alignXZ: 'bbox' },
      ),
    ]);

    for (const placement of KILLHOUSE_LAYOUT_PINK_PROP_PLACEMENTS) {
      addPropInstance(this.group, visualTemplate, placement);
      addPropInstance(this.collisionGroup, collisionTemplate, placement);
    }
  }
}
