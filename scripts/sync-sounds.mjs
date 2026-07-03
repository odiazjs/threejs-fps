import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sourceDir = join(process.cwd(), 'sounds');
const targetDir = join(process.cwd(), 'public', 'sounds');

mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(sourceDir)) {
  if (!file.endsWith('.wav') && !file.endsWith('.mp3')) continue;
  cpSync(join(sourceDir, file), join(targetDir, file));
  copied += 1;
}

console.log(`[sync-sounds] Copied ${copied} sound file(s) to public/sounds/`);
