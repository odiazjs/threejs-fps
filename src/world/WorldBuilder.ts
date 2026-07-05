import type * as THREE from 'three';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { TerrainBuilder } from './TerrainBuilder';
import { DroneField } from './DroneField';
import { LightBeams } from './LightBeams';
import { PlatformLiftParticles } from './PlatformLiftParticles';
import { KillhouseWall } from './KillhouseWall';
import { KillhouseCenterHouse } from './KillhouseCenterHouse';
import type { GrassQualityProfile } from '../render/grassQuality';
import { createKillhouseSkyboxTexture, createSkyboxTexture } from './SkyboxBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();
  private terrainBuilder: TerrainBuilder | null = null;
  private droneField: DroneField | null = null;
  private lightBeams: LightBeams | null = null;
  private platformParticles: PlatformLiftParticles | null = null;
  private mapGroup: THREE.Object3D | null = null;
  private killhouseWall: KillhouseWall | null = null;
  private killhouseCenterHouse: KillhouseCenterHouse | null = null;
  private readonly mapDef;

  constructor(mapId: MapId = 'kilo_sector') {
    this.mapDef = getMapDef(normalizeMapId(mapId));
  }

  build(): this {
    const isKillhouse = this.mapDef.id === 'killhouse_small';
    const skybox = isKillhouse ? createKillhouseSkyboxTexture() : createSkyboxTexture();
    const fogColor = isKillhouse ? 0xc8a060 : this.mapDef.outdoor ? 0x88d4f0 : 0x1a2228;
    const fogNear = isKillhouse ? this.mapDef.mapHalf * 1.4 : this.mapDef.mapHalf * 0.5;
    const fogFar = isKillhouse ? this.mapDef.mapHalf * 5 : this.mapDef.mapHalf * 2.2;
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
    this.mapGroup = mapGroup;
    this.sceneBuilder.addObject(mapGroup);

    if (this.mapDef.id === 'killhouse_small') {
      this.killhouseWall = new KillhouseWall();
      this.killhouseCenterHouse = new KillhouseCenterHouse();
      this.sceneBuilder
        .addObject(this.killhouseWall.group)
        .addObject(this.killhouseCenterHouse.group)
        .addObject(this.killhouseCenterHouse.collisionGroup);
    }
    return this;
  }

  whenKillhouseBulletBvhReady(): Promise<void> {
    if (this.mapDef.id !== 'killhouse_small') return Promise.resolve();
    if (!this.killhouseWall || !this.killhouseCenterHouse) {
      return Promise.resolve();
    }

    return Promise.all([
      this.killhouseWall.whenReady,
      this.killhouseCenterHouse.whenReady,
    ]).then(() => undefined);
  }

  getKillhouseBulletBvhRoots(): THREE.Object3D[] {
    const roots: THREE.Object3D[] = [];
    if (this.mapGroup) roots.push(this.mapGroup);
    if (this.killhouseWall) roots.push(this.killhouseWall.group);
    if (this.killhouseCenterHouse) roots.push(this.killhouseCenterHouse.collisionGroup);
    return roots;
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
