/** Bump when models/audio/shaders change so clients re-run the first-load prewarm. */
export const CLIENT_ASSET_PREWARM_VERSION = 1;

const STORAGE_KEY = 'fps:client-assets-prewarmed';

export function isClientAssetPrewarmComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === String(CLIENT_ASSET_PREWARM_VERSION);
  } catch {
    return false;
  }
}

export function markClientAssetPrewarmComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(CLIENT_ASSET_PREWARM_VERSION));
  } catch {
    // Ignore quota / private-mode failures.
  }
}
