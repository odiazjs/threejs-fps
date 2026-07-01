import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const ICON_FILES = [
  'pistol_icon_1.png',
  'rifle_icon_1.png',
  'sniper_icon_1.png',
  'katana_melee_icon_1.png',
  'shield_charge_icon_1.png',
];

/** Checkerboard was baked in as opaque white/gray — strip to real alpha. */
function isCheckerboardPixel(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const spread = max - min;
  const avg = (r + g + b) / 3;
  return avg >= 198 && spread <= 10;
}

function stripCheckerboard(inputPath, outputPath) {
  const png = PNG.sync.read(fs.readFileSync(inputPath));

  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];

    if (isCheckerboardPixel(r, g, b)) {
      png.data[i + 3] = 0;
      continue;
    }

    // Soften halos where gray fringes touch weapon pixels.
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    const spread = max - min;
    const avg = (r + g + b) / 3;
    if (avg >= 185 && spread <= 14) {
      const t = Math.min(1, (avg - 185) / 30);
      png.data[i + 3] = Math.round(255 * (1 - t * 0.92));
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

for (const file of ICON_FILES) {
  const source = path.join(root, 'images', file);
  const publicDest = path.join(root, 'public', 'images', file);
  stripCheckerboard(source, publicDest);
  stripCheckerboard(source, source);
  console.log(`[inventory-icons] processed ${file}`);
}
