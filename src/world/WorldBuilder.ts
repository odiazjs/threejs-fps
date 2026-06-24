import type * as THREE from 'three';
import { MAP_HALF } from '../../shared/level/kiloSectorColliders';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { TerrainBuilder } from './TerrainBuilder';
import { DroneField } from './DroneField';
import { createSkyboxTexture } from './SkyboxBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();
  private terrainBuilder: TerrainBuilder | null = null;
  private droneField: DroneField | null = null;

  build(): this {
    this.sceneBuilder
      .build()
      .addBackground(createSkyboxTexture())
      .addFog(0xb8ccd8, MAP_HALF * 0.55, MAP_HALF * 2.4);
    return this;
  }

  withLighting(): this {
    const { hemi, sun } = new LightingBuilder().build();
    this.sceneBuilder.addLight(hemi).addLight(sun);
    return this;
  }

  withTerrain(): this {
    this.terrainBuilder = new TerrainBuilder();
    this.sceneBuilder.addObject(this.terrainBuilder.build());
    return this;
  }

  withLevel(): this {
    for (const object of new LevelBuilder().build()) {
      this.sceneBuilder.addObject(object);
    }
    return this;
  }

  withDrones(): this {
    this.droneField = new DroneField();
    this.sceneBuilder.addObject(this.droneField.group);
    return this;
  }

  getTerrain(): TerrainBuilder | null {
    return this.terrainBuilder;
  }

  getDroneField(): DroneField | null {
    return this.droneField;
  }

  getScene(): THREE.Scene {
    return this.sceneBuilder.getScene();
  }
}
