import type * as THREE from 'three';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { createSkyboxTexture } from './SkyboxBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();

  build(): this {
    this.sceneBuilder.build().addBackground(createSkyboxTexture());
    return this;
  }

  withLighting(): this {
    const { hemi, sun } = new LightingBuilder().build();
    this.sceneBuilder.addLight(hemi).addLight(sun);
    return this;
  }

  withLevel(): this {
    for (const object of new LevelBuilder().build()) {
      this.sceneBuilder.addObject(object);
    }
    return this;
  }

  getScene(): THREE.Scene {
    return this.sceneBuilder.getScene();
  }
}
