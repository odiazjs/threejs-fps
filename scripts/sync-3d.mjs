import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourceDir = join(process.cwd(), '3d');
const targetDir = join(process.cwd(), 'public', '3d');

mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(sourceDir)) {
  if (file.startsWith('.')) continue;

  const sourcePath = join(sourceDir, file);
  if (!statSync(sourcePath).isFile()) continue;

  cpSync(sourcePath, join(targetDir, file));
  copied += 1;
}

console.log(`[sync-3d] Copied ${copied} file(s) to public/3d/`);
