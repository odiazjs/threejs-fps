import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copy Three.js Basis Universal transcoder into public/ so KTX2Loader can
 * fetch basis_transcoder.js + .wasm at runtime.
 */
const sourceDir = join(
  process.cwd(),
  'node_modules',
  'three',
  'examples',
  'jsm',
  'libs',
  'basis',
);
const targetDir = join(process.cwd(), 'public', 'basis');

if (!statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[sync-basis] Missing ${sourceDir} � run npm install`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
let copied = 0;
for (const entry of readdirSync(sourceDir)) {
  if (entry.startsWith('.')) continue;
  if (!/\.(js|wasm|md)$/i.test(entry)) continue;
  cpSync(join(sourceDir, entry), join(targetDir, entry));
  copied += 1;
}

console.log(`[sync-basis] Copied ${copied} file(s) to public/basis/`);
