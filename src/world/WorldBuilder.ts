import * as THREE from 'three';
import { SKY } from '../content/theme';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();

  build(): this {
    this.sceneBuilder.build().addBackground(new THREE.Color(SKY));
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
