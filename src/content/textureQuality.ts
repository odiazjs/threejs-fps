import * as THREE from 'three';
import { resolveGraphicsQuality } from '../render/graphicsQuality';

/**
 * Central texture quality for Meshy / FBX / GLB assets.
 *
 * Meshy 2K atlases still look soft up close when:
 * - anisotropy stays at Three's default (1)
 * - mip/filter settings are left unset
 * - color maps miss SRGBColorSpace
 *
 * Call {@link bindTextureQualityRenderer} once the WebGLRenderer exists, then
 * {@link configureColorTexture} / {@link optimizeObjectTextures} on loads.
 */

const COLOR_MAP_KEYS = ['map', 'emissiveMap'] as const;
const DATA_MAP_KEYS = [
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
] as const;

let maxAnisotropy = 8;

function isCompressedTexture(texture: THREE.Texture): boolean {
  return (texture as THREE.CompressedTexture).isCompressedTexture === true;
}

/** Cache GPU max anisotropy (clamped by graphics quality tier). */
export function bindTextureQualityRenderer(renderer: THREE.WebGLRenderer): void {
  const gpuMax = Math.max(1, renderer.capabilities.getMaxAnisotropy());
  const tierCap = resolveGraphicsQuality(renderer).maxAnisotropy;
  maxAnisotropy = Math.max(1, Math.min(gpuMax, tierCap));
  // Affects textures created after this call (r152+).
  THREE.Texture.DEFAULT_ANISOTROPY = maxAnisotropy;
}

export function getTextureMaxAnisotropy(): number {
  return maxAnisotropy;
}

function applySharedTextureFilters(texture: THREE.Texture): void {
  // KTX2/Basis already ships mip chains — do not ask WebGL to regenerate them.
  if (!isCompressedTexture(texture)) {
    texture.generateMipmaps = true;
  }
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
}

/** Albedo / emissive / other sRGB color maps. */
export function configureColorTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  applySharedTextureFilters(texture);
}

/** Normals / roughness / metalness / AO (linear data). */
export function configureDataTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.NoColorSpace;
  applySharedTextureFilters(texture);
}

/**
 * Walk every mesh material and apply filtering + max anisotropy.
 * Safe to call after FBXLoader / GLTFLoader / Meshy material swaps.
 */
export function optimizeObjectTextures(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material) continue;
      configureMaterialTextures(material);
    }
  });
}

export function configureMaterialTextures(material: THREE.Material): void {
  const mat = material as THREE.Material & Record<string, unknown>;
  for (const key of COLOR_MAP_KEYS) {
    const texture = mat[key];
    if (texture instanceof THREE.Texture) configureColorTexture(texture);
  }
  for (const key of DATA_MAP_KEYS) {
    const texture = mat[key];
    if (texture instanceof THREE.Texture) configureDataTexture(texture);
  }
}
