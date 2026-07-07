import * as THREE from 'three';
import { DEFAULT_LOADOUT_CONFIGS } from '../content/weaponConfig';
import { ShieldBreakFx } from '../effects/ShieldBreakFx';
import { getBoltCoreGeometry, getBoltCoreMaterial, getBoltGlowGeometry, getBoltGlowMaterial } from './boltVisualShared';
import { prewarmHitSplashesGpu, warmHitSplashPool } from './hitSplashPool';
import { MuzzleFlash } from './MuzzleFlash';

const PREWARM_POSITION = new THREE.Vector3(0, -10_000, 0);
const PREWARM_DIRECTION = new THREE.Vector3(0, 0, -1);

function touchBoltVisualAssets(): void {
  getBoltCoreGeometry();
  getBoltGlowGeometry();
  getBoltCoreMaterial();
  getBoltGlowMaterial();
}

/**
 * Compile GPU programs for combat visuals on the given renderer context.
 * Also fills the hit-splash pool so the first in-match impact reuses instances.
 */
export async function runShaderPrewarm(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  const holder = new THREE.Group();
  holder.position.copy(PREWARM_POSITION);
  scene.add(holder);

  warmHitSplashPool();
  touchBoltVisualAssets();

  const shieldBreak = new ShieldBreakFx();
  shieldBreak.play();
  holder.add(shieldBreak.object);

  const muzzleFlashes: MuzzleFlash[] = [];
  for (const config of DEFAULT_LOADOUT_CONFIGS) {
    if (!config.muzzleFlash) continue;
    const flash = new MuzzleFlash(PREWARM_POSITION, PREWARM_DIRECTION, config.muzzleFlash);
    holder.add(flash.object);
    muzzleFlashes.push(flash);
  }

  try {
    await prewarmHitSplashesGpu(renderer, scene, camera);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
  } finally {
    shieldBreak.dispose();
    for (const flash of muzzleFlashes) {
      flash.dispose();
    }
    scene.remove(holder);
  }
}

/** @deprecated Use runShaderPrewarm */
export async function prewarmCombatFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  await runShaderPrewarm(renderer, scene, camera);
}
