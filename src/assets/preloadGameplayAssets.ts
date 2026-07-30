import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HARVEST_MAP_COLLISION_BAKE, HARVEST_MAP_METADATA_BAKE, HARVEST_MAP_MODEL } from '../../shared/level/harvestMapConfig';
import { TDM_MAP_COLLISION_BAKE, TDM_MAP_METADATA_BAKE, TDM_MAP_MODEL } from '../../shared/level/tdmMapConfig';
import { FIRING_RANGE_MODEL } from '../../shared/level/firingRangeConfig';
import { FIRING_RANGE_METADATA_BAKE } from '../../shared/level/firingRangeBake';
import { LOBBY_MAP_MODEL } from '../world/LobbyMap';
import { preloadCraftingStationModel } from '../world/craftingStationVisual';
import { preloadHarvestingBoxModel } from '../world/harvestingBoxVisual';
import { preloadTeamBaseModels } from '../world/teamBaseVisual';
import { preloadHillWallModel } from '../world/hillWallVisual';
import {
  FP_ARMS_PISTOL_IDLE_FILE,
  FP_ARMS_RELOAD_FILE,
  FP_ARMS_RIFLE_IDLE_FILE,
  FP_ARMS_SPRINT_FILE,
} from '../player/FpArmsViewModel';
import { enableThreeAssetCache } from './browserAssetCache';

const ASSET_BASE = '/3d/';

function mapUrl(file: string): string {
  return `${ASSET_BASE}${encodeURIComponent(file)}`;
}

function armsUrl(file: string): string {
  return `${ASSET_BASE}${file.split('/').map(encodeURIComponent).join('/')}`;
}

/** Prefetch bytes into HTTP / THREE FileLoader cache (no parse). */
async function prefetchUrl(url: string): Promise<void> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to prefetch ${url} (${response.status})`);
  }
  if (!THREE.Cache.enabled) {
    await response.arrayBuffer();
    return;
  }
  // Match FileLoader expectations — never stash images as ArrayBuffers.
  if (/\.(json|txt)$/i.test(url)) {
    THREE.Cache.add(url, await response.text());
    return;
  }
  if (/\.(glb|gltf|fbx|bin|wav|mp3|ogg)$/i.test(url)) {
    THREE.Cache.add(url, await response.arrayBuffer());
    return;
  }
  await response.arrayBuffer();
}

/**
 * Decode every match + lobby map GLB so first match join never races the download.
 * Also warms collision bins / minimap bake JSON.
 */
export async function preloadAllMapAssets(): Promise<void> {
  enableThreeAssetCache();
  const loader = new GLTFLoader();
  loader.setResourcePath(ASSET_BASE);

  const glbFiles = [
    LOBBY_MAP_MODEL,
    HARVEST_MAP_MODEL,
    TDM_MAP_MODEL,
    FIRING_RANGE_MODEL,
  ];

  await Promise.all([
    ...glbFiles.map(async (file) => {
      const url = mapUrl(file);
      try {
        await loader.loadAsync(url);
      } catch (error) {
        console.warn(`[Preload] Map GLB failed: ${file}`, error);
      }
    }),
    ...[
      HARVEST_MAP_COLLISION_BAKE,
      HARVEST_MAP_METADATA_BAKE,
      TDM_MAP_COLLISION_BAKE,
      TDM_MAP_METADATA_BAKE,
      FIRING_RANGE_METADATA_BAKE,
    ].map(async (file) => {
      try {
        await prefetchUrl(mapUrl(file));
      } catch (error) {
        console.warn(`[Preload] Map bake failed: ${file}`, error);
      }
    }),
  ]);
}

/** Harvest / mode props that used to load only after joining a match. */
export async function preloadGameModeProps(): Promise<void> {
  await Promise.all([
    preloadCraftingStationModel(),
    preloadHarvestingBoxModel(),
    preloadTeamBaseModels(),
    preloadHillWallModel(),
  ]);
}

/** Warm FP arms FBXs so first-person arms appear without a hitch. */
export async function preloadFpArmsAssets(): Promise<void> {
  enableThreeAssetCache();
  await Promise.all(
    [
      FP_ARMS_RIFLE_IDLE_FILE,
      FP_ARMS_PISTOL_IDLE_FILE,
      FP_ARMS_RELOAD_FILE,
      FP_ARMS_SPRINT_FILE,
    ].map(async (file) => {
      try {
        await prefetchUrl(armsUrl(file));
      } catch (error) {
        console.warn(`[Preload] FP arms failed: ${file}`, error);
      }
    }),
  );
}
