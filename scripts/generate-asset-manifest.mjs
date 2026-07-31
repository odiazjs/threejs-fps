/**
 * Walks public/3d, public/sounds, public/images and writes
 * public/asset-manifest.json with a content hash per file + overall version.
 * Run after sync:3d / sync:images / sync:sounds so new maps/models invalidate clients.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'asset-manifest.json');

/** Top-level public folders that gameplay + lobby need cached. */
const ASSET_ROOTS = ['3d', 'sounds', 'images'];

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    // Skip editor backups / temp files � not needed at runtime.
    if (/\.(bak|tmp|DS_Store)$/i.test(entry)) continue;
    if (entry.endsWith('.source.glb')) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    out.push(full);
  }
  return out;
}

function toPublicUrl(absPath) {
  const rel = relative(PUBLIC, absPath).split(sep).join('/');
  return `/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

function hashFile(absPath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex').slice(0, 16)));
  });
}

async function main() {
  mkdirSync(PUBLIC, { recursive: true });

  const files = [];
  for (const root of ASSET_ROOTS) {
    walkFiles(join(PUBLIC, root), files);
  }
  files.sort((a, b) => a.localeCompare(b));

  /** @type {Record<string, string>} */
  const entries = {};
  const versionHash = createHash('sha256');

  for (const abs of files) {
    const url = toPublicUrl(abs);
    const digest = await hashFile(abs);
    entries[url] = digest;
    versionHash.update(url);
    versionHash.update(digest);
  }

  const manifest = {
    version: versionHash.digest('hex').slice(0, 24),
    generatedAt: new Date().toISOString(),
    fileCount: Object.keys(entries).length,
    files: entries,
  };

  writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `[asset-manifest] Wrote ${manifest.fileCount} file(s), version=${manifest.version}`,
  );
}

main().catch((error) => {
  console.error('[asset-manifest] Failed', error);
  process.exitCode = 1;
});
