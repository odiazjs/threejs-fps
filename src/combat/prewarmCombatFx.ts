import * as THREE from 'three';
import { PICKABLE_WEAPON_CONFIGS } from '../content/weaponConfig';
import { ShieldBreakFx } from '../effects/ShieldBreakFx';
import { getBoltCoreGeometry, getBoltCoreMaterial, getBoltGlowGeometry, getBoltGlowMaterial } from './boltVisualShared';
import { touchBioLiquidBoltAssets } from './bioLiquidBoltShared';
import { prewarmHitSplashesGpu, warmHitSplashPool } from './hitSplashPool';
import { MuzzleFlash } from './MuzzleFlash';
import { ProjectileSmokeTrail } from './ProjectileSmokeTrail';
import { touchSmokeTrailAssets } from './smokeTrailShared';

const PREWARM_POSITION = new THREE.Vector3(0, -10_000, 0);
const PREWARM_DIRECTION = new THREE.Vector3(0, 0, -1);

function touchBoltVisualAssets(): void {
  getBoltCoreGeometry();
  getBoltGlowGeometry();
  getBoltCoreMaterial();
  getBoltGlowMaterial();
  touchBioLiquidBoltAssets();
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
  touchSmokeTrailAssets();

  const shieldBreak = new ShieldBreakFx();
  shieldBreak.play();
  holder.add(shieldBreak.object);

  const muzzleFlashes: MuzzleFlash[] = [];
  for (const config of PICKABLE_WEAPON_CONFIGS) {
    if (!config.muzzleFlash) continue;
    const flash = new MuzzleFlash(PREWARM_POSITION, PREWARM_DIRECTION, config.muzzleFlash);
    holder.add(flash.object);
    muzzleFlashes.push(flash);
  }

  const smokeTrail = new ProjectileSmokeTrail();
  smokeTrail.reset();
  smokeTrail.emit(PREWARM_POSITION, PREWARM_DIRECTION, 0.02);
  smokeTrail.update(0.02);
  holder.add(smokeTrail.object);

  try {
    await prewarmHitSplashesGpu(renderer, scene, camera);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
  } finally {
    shieldBreak.dispose();
    for (const flash of muzzleFlashes) {
      flash.dispose();
    }
    smokeTrail.dispose();
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
