import type * as THREE from 'three';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';
import type { CraftingStationSpawn } from '../../shared/level/craftingStationSpawns';
import { SceneBuilder } from '../sceneBuilder';
import { LevelBuilder } from './LevelBuilder';
import { LightingBuilder } from './LightingBuilder';
import { FiringRangeMap } from './FiringRangeMap';
import { HarvestMap } from './HarvestMap';
import { ShowcaseMap } from './ShowcaseMap';
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
  private showcaseMap: ShowcaseMap | null = null;
  private readonly mapDef;

  constructor(mapId: MapId = 'firing_range') {
    this.mapDef = getMapDef(normalizeMapId(mapId));
  }

  build(): this {
    const isChronoBowl = this.mapDef.id === 'killhouse_small';
    const isHarvest = this.mapDef.id === 'harvest';
    const isFiringRange = this.mapDef.id === 'firing_range';
    const isShowcase = this.mapDef.id === 'showcase';

    this.sceneBuilder.build();

    // Harvest / showcase: indoor neon — no skybox (leave background unset).
    if (!isShowcase && !isHarvest) {
      const skybox = isChronoBowl
        ? createLobbySkyboxTexture()
        : isFiringRange
          ? createKillhouseSkyboxTexture()
          : createSkyboxTexture();
      this.sceneBuilder.addBackground(skybox);
    }

    let fogColor: number;
    let fogNear: number;
    let fogFar: number;
    if (isShowcase || isHarvest) {
      fogColor = 0x0a0c10;
      fogNear = this.mapDef.mapHalf * 1.8;
      fogFar = this.mapDef.mapHalf * 5.5;
    } else if (isChronoBowl) {
      fogColor = 0xb8a8c8;
      fogNear = 22;
      fogFar = 78;
    } else if (isFiringRange) {
      fogColor = 0xd0a868;
      fogNear = this.mapDef.mapHalf * 1.25;
      fogFar = this.mapDef.mapHalf * 4.6;
    } else {
      fogColor = 0x1a2228;
      fogNear = this.mapDef.mapHalf * 0.5;
      fogFar = this.mapDef.mapHalf * 2.15;
    }

    this.sceneBuilder.addFog(fogColor, fogNear, fogFar);
    return this;
  }

  withLighting(): this {
    if (this.mapDef.id === 'showcase' || this.mapDef.id === 'harvest') {
      this.sceneBuilder.addObject(new LightingBuilder().buildShowcase());
      return this;
    }
    if (this.mapDef.id === 'killhouse_small') {
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

    if (this.mapDef.id === 'showcase') {
      this.showcaseMap = new ShowcaseMap();
      this.sceneBuilder.addObject(this.showcaseMap.group);
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
    if (this.mapDef.id === 'showcase' && this.showcaseMap) {
      return this.showcaseMap.whenReady;
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
    if (this.mapDef.id === 'showcase' && this.showcaseMap) {
      return this.showcaseMap.getPhysicsRoots();
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
