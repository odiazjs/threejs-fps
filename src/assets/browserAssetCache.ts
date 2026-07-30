import * as THREE from 'three';
import type { AssetManifest } from './assetManifest';

const CACHE_PREFIX = 'fps-assets-';
const CONCURRENCY = 6;

export type AssetCacheProgress = (done: number, total: number, url: string) => void;

function cacheNameForVersion(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** Enable THREE.FileLoader memory cache so GLTF/FBX reuse prefetched buffers. */
export function enableThreeAssetCache(): void {
  THREE.Cache.enabled = true;
}

/**
 * Formats safe for THREE.FileLoader's Cache (ArrayBuffer / text).
 * Never put images here ù ImageLoader expects HTMLImageElement / ImageBitmap;
 * an ArrayBuffer causes `texSubImage2D` overload failures.
 */
function isFileLoaderAsset(url: string): boolean {
  return /\.(glb|gltf|fbx|bin|wav|mp3|ogg|json|txt)$/i.test(url);
}

async function putInThreeCache(url: string, response: Response): Promise<void> {
  if (!THREE.Cache.enabled) return;
  if (!isFileLoaderAsset(url)) return;
  try {
    if (/\.(json|txt)$/i.test(url)) {
      const text = await response.clone().text();
      THREE.Cache.add(url, text);
      return;
    }
    const buffer = await response.clone().arrayBuffer();
    THREE.Cache.add(url, buffer);
  } catch {
    // Cache miss is fine ù loaders will fetch normally.
  }
}

async function cacheOne(
  cache: Cache,
  url: string,
): Promise<'hit' | 'fetched' | 'failed'> {
  try {
    const existing = await cache.match(url);
    if (existing?.ok) {
      await putInThreeCache(url, existing);
      return 'hit';
    }

    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      console.warn(`[AssetCache] Failed ${url} (${response.status})`);
      return 'failed';
    }
    await cache.put(url, response.clone());
    await putInThreeCache(url, response);
    return 'fetched';
  } catch (error) {
    console.warn(`[AssetCache] Error caching ${url}`, error);
    return 'failed';
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!, index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/**
 * Copy Cache API entries into THREE.Cache for this JS realm (lobby and game
 * iframe do not share memory ù call on each page boot after a prior download).
 */
export async function hydrateThreeCacheFromBrowser(
  manifest: AssetManifest,
): Promise<void> {
  enableThreeAssetCache();
  if (typeof caches === 'undefined') return;

  try {
    const cache = await caches.open(cacheNameForVersion(manifest.version));
    const urls = Object.keys(manifest.files);
    await mapPool(urls, CONCURRENCY, async (url) => {
      const existing = await cache.match(url);
      if (existing?.ok) await putInThreeCache(url, existing);
    });
  } catch (error) {
    console.warn('[AssetCache] Failed to hydrate THREE.Cache', error);
  }
}

/**
 * Download every manifest URL into the Cache API + THREE.Cache.
 * Old versioned caches are deleted after a successful pass.
 */
export async function ensureBrowserAssetsCached(
  manifest: AssetManifest,
  onProgress: AssetCacheProgress = () => {},
): Promise<{ fetched: number; hit: number; failed: number }> {
  enableThreeAssetCache();

  if (typeof caches === 'undefined') {
    // Private mode / unsupported ó still warm THREE.Cache via fetch.
    const urls = Object.keys(manifest.files);
    let done = 0;
    let fetched = 0;
    let failed = 0;
    await mapPool(urls, CONCURRENCY, async (url) => {
      try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) {
          failed += 1;
        } else {
          await putInThreeCache(url, response);
          fetched += 1;
        }
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress(done, urls.length, url);
    });
    return { fetched, hit: 0, failed };
  }

  const name = cacheNameForVersion(manifest.version);
  const cache = await caches.open(name);
  const urls = Object.keys(manifest.files);
  let done = 0;
  let fetched = 0;
  let hit = 0;
  let failed = 0;

  await mapPool(urls, CONCURRENCY, async (url) => {
    const result = await cacheOne(cache, url);
    if (result === 'fetched') fetched += 1;
    else if (result === 'hit') hit += 1;
    else failed += 1;
    done += 1;
    onProgress(done, urls.length, url);
  });

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== name)
        .map((key) => caches.delete(key)),
    );
  } catch {
    // Ignore cleanup failures.
  }

  return { fetched, hit, failed };
}
