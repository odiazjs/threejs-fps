import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourceDir = join(process.cwd(), '3d');
const targetDir = join(process.cwd(), 'public', '3d');

mkdirSync(targetDir, { recursive: true });

let copied = 0;

function copyRecursive(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });

  for (const entry of readdirSync(srcDir)) {
    if (entry.startsWith('.')) continue;

    const sourcePath = join(srcDir, entry);
    const targetPath = join(destDir, entry);
    const stats = statSync(sourcePath);

    if (stats.isDirectory()) {
      copyRecursive(sourcePath, targetPath);
      continue;
    }

    cpSync(sourcePath, targetPath);
    copied += 1;
  }
}

copyRecursive(sourceDir, targetDir);
console.log(`[sync-3d] Copied ${copied} file(s) to public/3d/`);
