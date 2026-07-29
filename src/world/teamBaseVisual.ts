import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { FBX_WEAPON_ASSET_BASE } from '../content/fbxWeaponMesh';
import { configureColorTexture, optimizeObjectTextures } from '../content/textureQuality';

interface TeamBaseAsset {
  fbx: string;
  texture: string;
  fallbackEmissive: number;
  contentName: string;
}

const ASSETS: Record<0 | 1, TeamBaseAsset> = {
  0: {
    fbx: 'game_modes/team_base_blue_2.fbx',
    texture: '/3d/game_modes/team_base_blue_2_texture.png',
    fallbackEmissive: 0x4aa3ff,
    contentName: 'teamBaseBlueContent',
  },
  1: {
    fbx: 'game_modes/team_base_orange_2.fbx',
    // Authored filename omits underscore before "texture".
    texture: '/3d/game_modes/team_base_orange_2texture.png',
    fallbackEmissive: 0xff8a3d,
    contentName: 'teamBaseOrangeContent',
  },
};

const textureLoader = new THREE.TextureLoader();

const templates: Partial<Record<0 | 1, THREE.Group>> = {};
const loadPromises: Partial<Record<0 | 1, Promise<THREE.Group>>> = {};
/** Local AABB size of each normalized template (scale = 1). */
const localSizes: Partial<Record<0 | 1, THREE.Vector3>> = {};

function loadEmissiveTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        configureColorTexture(texture);
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function applyMeshyMaterials(
  root: THREE.Object3D,
  emissiveMap: THREE.Texture | null,
  fallbackEmissive: number,
): void {
  const material = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    emissive: emissiveMap ? 0xffffff : fallbackEmissive,
    emissiveIntensity: 1,
    emissiveMap: emissiveMap ?? undefined,
    shininess: 0,
  });
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      for (const old of child.material) old.dispose();
    } else {
      child.material.dispose();
    }
    child.material = material;
  });
}

function normalizeRoot(
  root: THREE.Group,
  teamId: 0 | 1,
  contentName: string,
): THREE.Group {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  localSizes[teamId] = new THREE.Vector3(
    Math.max(size.x, 1e-4),
    Math.max(size.y, 1e-4),
    Math.max(size.z, 1e-4),
  );

  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  root.name = contentName;
  return root;
}

function loadTemplate(teamId: 0 | 1): Promise<THREE.Group> {
  const cached = templates[teamId];
  if (cached) return Promise.resolve(cached);
  const pending = loadPromises[teamId];
  if (pending) return pending;

  const asset = ASSETS[teamId];
  const promise = (async () => {
    const loader = new FBXLoader();
    loader.setResourcePath(`${FBX_WEAPON_ASSET_BASE}game_modes/`);
    const fbx = await loader.loadAsync(`${FBX_WEAPON_ASSET_BASE}${asset.fbx}`);
    let emissiveMap: THREE.Texture | null = null;
    try {
      emissiveMap = await loadEmissiveTexture(asset.texture);
    } catch (error) {
      console.warn(`[TeamBase] Texture failed for team ${teamId}`, error);
    }
    applyMeshyMaterials(fbx as THREE.Group, emissiveMap, asset.fallbackEmissive);
    optimizeObjectTextures(fbx as THREE.Group);
    const normalized = normalizeRoot(fbx as THREE.Group, teamId, asset.contentName);
    templates[teamId] = normalized;
    return normalized;
  })().finally(() => {
    delete loadPromises[teamId];
  });

  loadPromises[teamId] = promise;
  return promise;
}

/**
 * Clone sized so local height matches `targetHeight` (marker / proxy AABB).
 */
export async function createTeamBaseMesh(
  teamId: 0 | 1,
  targetHeight: number,
): Promise<THREE.Group> {
  const source = await loadTemplate(teamId);
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      child.material = (child.material as THREE.Material).clone();
    }
  });
  const local = localSizes[teamId] ?? new THREE.Vector3(1, 1, 1);
  const height = Math.max(targetHeight, 0.5);
  clone.scale.setScalar(height / local.y);
  clone.updateMatrixWorld(true);
  return clone;
}
