import { DEFAULT_CHARACTER_ITEM_ID } from './storeItemTypes.js';

/**
 * Shared body mesh for all store character skins.
 * Skins differentiate via emissiveMap texture swaps on this single FBX.
 */
export const SHARED_CHARACTER_MESH_FILE = 'meshy_character_idle_quads.fbx';

/** Fallback / default skin emissive texture. */
export const SHARED_CHARACTER_EMISSIVE_TEXTURE_URL =
  '/images/store/meshy_character_default_texture.png';

/**
 * Per store-skin emissive textures (store item id → URL).
 * Missing ids fall back to {@link SHARED_CHARACTER_EMISSIVE_TEXTURE_URL}.
 */
export const SHARED_CHARACTER_SKIN_TEXTURE_URLS: Readonly<Record<string, string>> = {
  basic: '/images/store/meshy_character_default_texture.png',
  silver: '/images/store/meshy_character_silver_texture.png',
};

export function getCharacterSkinTextureUrl(skinId: string): string {
  return (
    SHARED_CHARACTER_SKIN_TEXTURE_URLS[skinId] ??
    SHARED_CHARACTER_SKIN_TEXTURE_URLS[DEFAULT_CHARACTER_ITEM_ID] ??
    SHARED_CHARACTER_EMISSIVE_TEXTURE_URL
  );
}
