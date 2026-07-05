import * as THREE from 'three';
import { loadKillhouseWallTemplate } from './KillhouseWall';

export interface KillhousePropHouseConfig {
  name: string;
  visualModel: string;
  collisionModel: string;
  scale: number;
  position: { x: number; z: number };
  rotationY?: number;
  visualLod?: number | 'lowest-poly';
  /** LOD level for collision mesh. Default: lowest-poly with shell stripping. */
  collisionLod?: number | 'lowest-poly';
  /** False for pre-authored collision hulls (e.g. lod_house_flat LOD1). */
  shellCollision?: boolean;
}

/** Visual + invisible LOD collision hull for a killhouse enterable building. */
export class KillhousePropHouse {
  readonly group = new THREE.Group();
  readonly collisionGroup = new THREE.Group();
  readonly whenReady: Promise<void>;

  constructor(config: KillhousePropHouseConfig) {
    this.group.name = `killhouseHouse_${config.name}`;
    this.collisionGroup.name = `killhouseHouseCollision_${config.name}`;
    this.collisionGroup.visible = false;
    this.group.position.set(config.position.x, 0, config.position.z);
    this.collisionGroup.position.set(config.position.x, 0, config.position.z);
    if (config.rotationY) {
      this.group.rotation.y = config.rotationY;
      this.collisionGroup.rotation.y = config.rotationY;
    }

    const collisionLod = config.collisionLod ?? 'lowest-poly';
    const shellCollision = config.shellCollision ?? collisionLod === 'lowest-poly';

    const houseLoadOptions = { alignXZ: 'bbox' as const };

    this.whenReady = Promise.all([
      loadKillhouseWallTemplate(
        config.visualModel,
        config.scale,
        config.visualLod ?? 0,
        houseLoadOptions,
      )
        .then((template) => {
          this.group.add(template.clone(true));
        }),
      loadKillhouseWallTemplate(
        config.collisionModel,
        config.scale,
        collisionLod,
        { shellCollision, ...houseLoadOptions },
      )
        .then((template) => {
          this.collisionGroup.add(template.clone(true));
        }),
    ])
      .then(() => undefined)
      .catch((error) => {
        console.warn(`[KillhousePropHouse] Failed to load ${config.name}`, error);
      });
  }
}
