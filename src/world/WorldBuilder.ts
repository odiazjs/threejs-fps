import type * as THREE from 'three';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';
import type { CraftingStationSpawn } from '../../shared/level/craftingStationSpawns';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { FiringRangeMap } from './FiringRangeMap';
import { HarvestMap } from './HarvestMap';
import { TdmMap } from './TdmMap';
import {
  createKillhouseSkyboxTexture,
  createLobbySkyboxTexture,
  createSkyboxTexture,
} from './SkyboxBuilder';

export class WorldBuilder {
  private sceneBuilder = new SceneBuilder();
  private tdmMap: TdmMap | null = null;
  private harvestMap: HarvestMap | null = null;
  private firingRangeMap: FiringRangeMap | null = null;
  private readonly mapDef;

  constructor(mapId: MapId = 'firing_range') {
    this.mapDef = getMapDef(normalizeMapId(mapId));
  }

  build(): this {
    const isChronoBowl = this.mapDef.id === 'killhouse_small';
    const isHarvest = this.mapDef.id === 'harvest';
    const isFiringRange = this.mapDef.id === 'firing_range';
    // Harvest + Chrono-Bowl share the lobby peach / lavender dusk sky.
    const skybox =
      isChronoBowl || isHarvest
        ? createLobbySkyboxTexture()
        : isFiringRange
          ? createKillhouseSkyboxTexture()
          : createSkyboxTexture();

    let fogColor: number;
    let fogNear: number;
    let fogFar: number;
    if (isChronoBowl || isHarvest) {
      fogColor = 0xb8a8c8;
      fogNear = isHarvest ? 28 : 22;
      fogFar = isHarvest ? 110 : 78;
    } else if (isFiringRange) {
      fogColor = 0xd0a868;
      fogNear = this.mapDef.mapHalf * 1.25;
      fogFar = this.mapDef.mapHalf * 4.6;
    } else {
      fogColor = 0x1a2228;
      fogNear = this.mapDef.mapHalf * 0.5;
      fogFar = this.mapDef.mapHalf * 2.15;
    }

    this.sceneBuilder
      .build()
      .addBackground(skybox)
      .addFog(fogColor, fogNear, fogFar);
    return this;
  }

  withLighting(): this {
    if (this.mapDef.id === 'killhouse_small' || this.mapDef.id === 'harvest') {
      for (const light of new LightingBuilder().buildChronoBowl()) {
        this.sceneBuilder.addLight(light);
      }
      return this;
    }
    const { hemi, sun } = new LightingBuilder().build();
    this.sceneBuilder.addLight(hemi).addLight(sun);
    return this;
  }

  withLevel(): this {
    const [mapGroup] = new LevelBuilder().build(this.mapDef.id);
    this.sceneBuilder.addObject(mapGroup);

    if (this.mapDef.id === 'killhouse_small') {
      this.tdmMap = new TdmMap();
      this.sceneBuilder.addObject(this.tdmMap.group);
    }

    if (this.mapDef.id === 'harvest') {
      this.harvestMap = new HarvestMap();
      this.sceneBuilder.addObject(this.harvestMap.group);
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
    if (this.mapDef.id === 'harvest' && this.harvestMap) {
      return this.harvestMap.whenReady;
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
    if (this.mapDef.id === 'harvest' && this.harvestMap) {
      return this.harvestMap.getPhysicsRoots();
    }
    if (this.mapDef.id === 'firing_range' && this.firingRangeMap) {
      return this.firingRangeMap.getPhysicsRoots();
    }
    return [];
  }

  getHarvestCraftingStationSpawns(): readonly CraftingStationSpawn[] {
    return this.harvestMap?.getCraftingStationSpawns() ?? [];
  }

  getHarvestHarvestingBoxSpawns(): readonly import('../../shared/level/harvestingBoxSpawns').HarvestingBoxSpawn[] {
    return this.harvestMap?.getHarvestingBoxSpawns() ?? [];
  }

  getMapDef() {
    return this.mapDef;
  }

  getScene(): THREE.Scene {
    return this.sceneBuilder.getScene();
  }
}
