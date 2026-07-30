export interface AssetManifest {
  readonly version: string;
  readonly generatedAt?: string;
  readonly fileCount: number;
  readonly files: Readonly<Record<string, string>>;
}

const MANIFEST_URL = '/asset-manifest.json';

let cachedManifest: AssetManifest | null = null;

/**
 * Fetch the build-time asset inventory. Always network-first so new deploys
 * invalidate the lobby bootstrap even when static files are long-cached.
 */
export async function loadAssetManifest(): Promise<AssetManifest> {
  if (cachedManifest) return cachedManifest;

  const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load asset manifest (${response.status})`);
  }
  const data = (await response.json()) as AssetManifest;
  if (!data?.version || !data.files || typeof data.files !== 'object') {
    throw new Error('Invalid asset manifest payload');
  }
  cachedManifest = data;
  return data;
}

export function getCachedAssetManifest(): AssetManifest | null {
  return cachedManifest;
}
