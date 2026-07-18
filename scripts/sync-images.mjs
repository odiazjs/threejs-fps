import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const sourceDir = join(process.cwd(), 'images');
const targetDir = join(process.cwd(), 'public', 'images');

mkdirSync(targetDir, { recursive: true });

let copied = 0;

function copyTree(dir) {
  for (const file of readdirSync(dir)) {
    if (file.startsWith('.')) continue;

    const sourcePath = join(dir, file);
    const rel = relative(sourceDir, sourcePath);
    const targetPath = join(targetDir, rel);

    if (statSync(sourcePath).isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath);
      continue;
    }

    mkdirSync(join(targetPath, '..'), { recursive: true });
    cpSync(sourcePath, targetPath);
    copied += 1;
  }
}

copyTree(sourceDir);

console.log(`[sync-images] Copied ${copied} file(s) to public/images/`);
