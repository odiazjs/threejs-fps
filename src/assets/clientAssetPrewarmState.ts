/** Bump when bootstrap code paths change (beyond content hashes). */
export const CLIENT_ASSET_PREWARM_CODE_VERSION = 3;

const STORAGE_KEY = 'fps:client-assets-prewarmed';
const MANIFEST_KEY = 'fps:client-assets-manifest-version';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** True when this code version + the current asset-manifest version were fully bootstrapped. */
export function isClientAssetPrewarmComplete(manifestVersion?: string): boolean {
  const codeOk =
    readStored(STORAGE_KEY) === String(CLIENT_ASSET_PREWARM_CODE_VERSION);
  if (!codeOk) return false;
  if (manifestVersion === undefined) {
    // Legacy callers without a manifest still treat code version as enough.
    return Boolean(readStored(MANIFEST_KEY));
  }
  return readStored(MANIFEST_KEY) === manifestVersion;
}

export function markClientAssetPrewarmComplete(manifestVersion: string): void {
  writeStored(STORAGE_KEY, String(CLIENT_ASSET_PREWARM_CODE_VERSION));
  writeStored(MANIFEST_KEY, manifestVersion);
}

export function getStoredManifestVersion(): string | null {
  return readStored(MANIFEST_KEY);
}
