import type * as THREE from 'three';
import { MAP_HALF } from '../../shared/level/kiloSectorColliders';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { TerrainBuilder } from './TerrainBuilder';
import { DroneField } from './DroneField';
import { LightBeams } from './LightBeams';
import { PlatformLiftParticles } from './PlatformLiftParticles';
import type { GrassQualityProfile } from '../render/grassQuality';
import { createSkyboxTexture } from './SkyboxBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();
  private terrainBuilder: TerrainBuilder | null = null;
  private droneField: DroneField | null = null;
  private lightBeams: LightBeams | null = null;
  private platformParticles: PlatformLiftParticles | null = null;

  build(): this {
    this.sceneBuilder
      .build()
      .addBackground(createSkyboxTexture())
      .addFog(0x88d4f0, MAP_HALF * 0.5, MAP_HALF * 2.2);
    return this;
  }

  withLighting(): this {
    const { hemi, sun } = new LightingBuilder().build();
    this.sceneBuilder.addLight(hemi).addLight(sun);
    return this;
  }

  withTerrain(quality?: GrassQualityProfile): this {
    this.terrainBuilder = new TerrainBuilder(quality);
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

  withLightBeams(): this {
    this.lightBeams = new LightBeams();
    this.sceneBuilder.addObject(this.lightBeams.group);
    return this;
  }

  withPlatformParticles(): this {
    this.platformParticles = new PlatformLiftParticles();
    this.sceneBuilder.addObject(this.platformParticles.group);
    return this;
  }

  getTerrain(): TerrainBuilder | null {
    return this.terrainBuilder;
  }

  getDroneField(): DroneField | null {
    return this.droneField;
  }

  getLightBeams(): LightBeams | null {
    return this.lightBeams;
  }

  getPlatformParticles(): PlatformLiftParticles | null {
    return this.platformParticles;
  }

  getScene(): THREE.Scene {
    return this.sceneBuilder.getScene();
  }
}
