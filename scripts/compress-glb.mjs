import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Geometry quantize + KTX2/Basis texture compression (no WebP).
 *
 * Requires native `ktx` / `toktx` from the `ktx2tools` devDependency.
 * glTF-Transform spawns `ktx` without a shell, so the real .exe directory
 * (not node_modules/.bin shims) must be on PATH.
 *
 * Usage:
 *   npm run compress:glb -- <input.glb> <output.glb>
 *
 * Modes (COMPRESS_KTX2_MODE):
 *   mix   (default) — UASTC for normal/ORM, high-quality ETC1S for the rest
 *   uastc           — UASTC for every texture (highest quality, larger files)
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmBinDir = join(repoRoot, 'node_modules', '.bin');

function ktxNativeBinDir() {
  const platformDir =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'darwin'
        : process.platform === 'linux'
          ? 'linux'
          : null;
  if (!platformDir) return null;
  return join(repoRoot, 'node_modules', 'ktx2tools', 'bin', platformDir);
}

const input = process.argv[2];
const output = process.argv[3];
const mode = (process.env.COMPRESS_KTX2_MODE ?? 'mix').toLowerCase();

if (!input || !output) {
  console.error(
    'Usage: npm run compress:glb -- <input.glb> <output.glb>\n' +
      'Env: COMPRESS_KTX2_MODE=mix|uastc (default mix)',
  );
  process.exit(1);
}

const inputPath = resolve(input);
const outputPath = resolve(output);
if (!existsSync(inputPath)) {
  console.error(`[compress:glb] Input not found: ${inputPath}`);
  process.exit(1);
}

const nativeBin = ktxNativeBinDir();
if (!nativeBin || !existsSync(nativeBin)) {
  console.error(
    '[compress:glb] Missing ktx2tools native binaries.\n' +
      'Run: npm install\n' +
      `Expected: ${nativeBin ?? 'ktx2tools/bin/<platform>'}`,
  );
  process.exit(1);
}

// Prefer native .exe dir first so spawn('ktx') works on Windows (no .cmd shim).
const pathEnv = [nativeBin, npmBinDir, process.env.PATH ?? ''].join(delimiter);

function run(command, args, label) {
  console.info(`[compress:glb] ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, PATH: pathEnv },
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`[compress:glb] Step failed: ${label}`);
  }
}

function ensureKtxTools() {
  const ktxName = process.platform === 'win32' ? 'ktx.exe' : 'ktx';
  const toktxName = process.platform === 'win32' ? 'toktx.exe' : 'toktx';
  const ktxPath = join(nativeBin, ktxName);
  const toktxPath = join(nativeBin, toktxName);
  if (!existsSync(ktxPath) || !existsSync(toktxPath)) {
    console.error(
      `[compress:glb] Expected ${ktxName} and ${toktxName} in:\n  ${nativeBin}`,
    );
    process.exit(1);
  }

  const probe = spawnSync(ktxPath, ['--version'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: pathEnv },
  });
  if (probe.status !== 0) {
    console.error('[compress:glb] Failed to run ktx --version');
    process.exit(1);
  }
  const version = (probe.stdout || probe.stderr || '').trim().split('\n')[0];
  console.info(`[compress:glb] ktx: ${version || ktxPath}`);
  console.info(`[compress:glb] PATH+= ${nativeBin}`);
}

function cleanup(paths) {
  for (const tmp of paths) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

const tmpQuantized = join(repoRoot, '.tmp-compress-quantized.glb');
const tmpUastc = join(repoRoot, '.tmp-compress-uastc.glb');

try {
  ensureKtxTools();
  if (inputPath === outputPath) {
    console.warn(
      '[compress:glb] Input and output are the same file — prefer compressing from a .source.glb backup',
    );
  }

  run(
    'npx',
    [
      '--yes',
      '@gltf-transform/cli',
      'optimize',
      inputPath,
      tmpQuantized,
      '--compress',
      'quantize',
      '--texture-compress',
      'false',
      '--simplify',
      'false',
      '--join',
      'false',
      '--flatten',
      'false',
      '--palette',
      'false',
      '--prune',
      'false',
      '--instance',
      'false',
    ],
    'quantize geometry (textures untouched)',
  );

  if (mode === 'uastc') {
    run(
      'npx',
      [
        '--yes',
        '@gltf-transform/cli',
        'uastc',
        tmpQuantized,
        outputPath,
        '--level',
        '2',
        '--zstd',
        '18',
        '--mipmaps',
        'true',
      ],
      'KTX2 UASTC (all textures)',
    );
  } else {
    run(
      'npx',
      [
        '--yes',
        '@gltf-transform/cli',
        'uastc',
        tmpQuantized,
        tmpUastc,
        '--slots',
        '{normalTexture,occlusionTexture,metallicRoughnessTexture}',
        '--level',
        '2',
        '--zstd',
        '18',
        '--mipmaps',
        'true',
      ],
      'KTX2 UASTC (normal / ORM slots)',
    );
    run(
      'npx',
      [
        '--yes',
        '@gltf-transform/cli',
        'etc1s',
        tmpUastc,
        outputPath,
        '--quality',
        '255',
        '--compression',
        '2',
        '--mipmaps',
        'true',
      ],
      'KTX2 ETC1S quality 255 (remaining textures)',
    );
  }

  console.info(`[compress:glb] Wrote ${outputPath} (mode=${mode})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  cleanup([tmpQuantized, tmpUastc]);
}
