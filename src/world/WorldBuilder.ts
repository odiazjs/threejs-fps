import type * as THREE from 'three';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { TerrainBuilder } from './TerrainBuilder';
import { DroneField } from './DroneField';
import { LightBeams } from './LightBeams';
import { PlatformLiftParticles } from './PlatformLiftParticles';
import { FiringRangeMap } from './FiringRangeMap';
import { TdmMap } from './TdmMap';
import type { GrassQualityProfile } from '../render/grassQuality';
import { createKillhouseSkyboxTexture, createSkyboxTexture } from './SkyboxBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();
  private terrainBuilder: TerrainBuilder | null = null;
  private droneField: DroneField | null = null;
  private lightBeams: LightBeams | null = null;
  private platformParticles: PlatformLiftParticles | null = null;
  private tdmMap: TdmMap | null = null;
  private firingRangeMap: FiringRangeMap | null = null;
  private readonly mapDef;

  constructor(mapId: MapId = 'kilo_sector') {
    this.mapDef = getMapDef(normalizeMapId(mapId));
  }

  build(): this {
    const isKillhouse = this.mapDef.id === 'killhouse_small';
    const isFiringRange = this.mapDef.id === 'firing_range';
    const skybox = isKillhouse
      ? createKillhouseSkyboxTexture()
      : isFiringRange
        ? createKillhouseSkyboxTexture()
        : createSkyboxTexture();
    const fogColor = isKillhouse || isFiringRange
      ? 0xc8a060
      : this.mapDef.outdoor
        ? 0x88d4f0
        : 0x1a2228;
    const fogNear = isKillhouse || isFiringRange
      ? this.mapDef.mapHalf * 1.4
      : this.mapDef.mapHalf * 0.5;
    const fogFar = isKillhouse || isFiringRange
      ? this.mapDef.mapHalf * 5
      : this.mapDef.mapHalf * 2.2;
    this.sceneBuilder
      .build()
      .addBackground(skybox)
      .addFog(fogColor, fogNear, fogFar);
    return this;
  }

  withLighting(): this {
    const { hemi, sun } = new LightingBuilder().build();
    this.sceneBuilder.addLight(hemi).addLight(sun);
    return this;
  }

  withTerrain(quality?: GrassQualityProfile): this {
    if (!this.mapDef.outdoor) return this;
    this.terrainBuilder = new TerrainBuilder(quality);
    this.sceneBuilder.addObject(this.terrainBuilder.build());
    return this;
  }

  withLevel(): this {
    const [mapGroup] = new LevelBuilder().build(this.mapDef.id);
    this.sceneBuilder.addObject(mapGroup);

    if (this.mapDef.id === 'killhouse_small') {
      this.tdmMap = new TdmMap();
      this.sceneBuilder.addObject(this.tdmMap.group);
    }

    if (this.mapDef.id === 'firing_range') {
      this.firingRangeMap = new FiringRangeMap();
      this.sceneBuilder.addObject(this.firingRangeMap.group);
    }
    return this;
  }

  whenMeshCollisionReady(): Promise<void> {
    if (this.mapDef.id === 'killhouse_small' && this.tdmMap) {
      return this.tdmMap.whenReady;
    }
    if (this.mapDef.id === 'firing_range' && this.firingRangeMap) {
      return this.firingRangeMap.whenReady;
    }
    return Promise.resolve();
  }

  getMeshCollisionRoots(): THREE.Object3D[] {
    if (this.mapDef.id === 'killhouse_small' && this.tdmMap) {
      return this.tdmMap.getPhysicsRoots();
    }
    if (this.mapDef.id === 'firing_range' && this.firingRangeMap) {
      return this.firingRangeMap.getPhysicsRoots();
    }
    return [];
  }

  withDrones(): this {
    if (!this.mapDef.outdoor) return this;
    this.droneField = new DroneField();
    this.sceneBuilder.addObject(this.droneField.group);
    return this;
  }

  withLightBeams(): this {
    if (!this.mapDef.outdoor) return this;
    this.lightBeams = new LightBeams();
    this.sceneBuilder.addObject(this.lightBeams.group);
    return this;
  }

  withPlatformParticles(): this {
    this.platformParticles = new PlatformLiftParticles();
    this.sceneBuilder.addObject(this.platformParticles.group);
    return this;
  }

  getMapDef() {
    return this.mapDef;
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
