import * as THREE from 'three';
import { PICKABLE_WEAPON_CONFIGS } from '../content/weaponConfig';
import { ExplosionFx } from '../effects/ExplosionFx';
import { initFxLightPool } from '../effects/FxLightPool';
import { MeleeHitFx } from '../effects/MeleeHitFx';
import { ShieldDomeChargeFx } from '../effects/ShieldDomeChargeFx';
import { ShieldDomeFx } from '../effects/ShieldDomeFx';
import { ShieldRechargeAuraFx } from '../effects/ShieldRechargeAuraFx';
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
  // The FX light pool MUST be in the scene before compiling: three keys every
  // lit program on the visible light count, so compiling with the final count
  // is what prevents whole-scene recompiles on the first shot/explosion/dome.
  initFxLightPool(scene);

  const holder = new THREE.Group();
  holder.position.copy(PREWARM_POSITION);
  scene.add(holder);

  warmHitSplashPool();
  touchBoltVisualAssets();
  touchSmokeTrailAssets();

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

  // Every remaining first-use effect: grenade explosion, melee impact,
  // shield dome (custom hex ShaderMaterial), dome charge, recharge aura.
  const explosion = new ExplosionFx();
  holder.add(explosion.object);
  explosion.play(0, 0, 0);

  const meleeHit = new MeleeHitFx();
  holder.add(meleeHit.object);
  meleeHit.play(new THREE.Vector3(0, 0, 0));

  const dome = getParkedPrewarmDome(scene);
  dome.object.visible = true;

  const domeCharge = new ShieldDomeChargeFx();
  holder.add(domeCharge.object);

  const rechargeAura = new ShieldRechargeAuraFx();
  holder.add(rechargeAura.object);
  rechargeAura.setActive(true);

  try {
    await prewarmHitSplashesGpu(renderer, scene, camera);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
  } finally {
    for (const flash of muzzleFlashes) {
      flash.dispose();
    }
    smokeTrail.dispose();
    explosion.dispose();
    meleeHit.dispose();
    // Dome stays parked (hidden): its hex ShaderMaterial owns a unique GPU
    // program — disposing it would release the cached program and the first
    // real dome would compile it again mid-match.
    dome.parkForPrewarm();
    domeCharge.dispose();
    rechargeAura.setActive(false);
    rechargeAura.dispose();
    scene.remove(holder);
  }
}

// One parked dome per scene keeps the hex-shield program alive in the cache.
let parkedDome: ShieldDomeFx | null = null;
let parkedDomeScene: THREE.Scene | null = null;

function getParkedPrewarmDome(scene: THREE.Scene): ShieldDomeFx {
  if (!parkedDome || parkedDomeScene !== scene) {
    parkedDome = new ShieldDomeFx(
      PREWARM_POSITION.x,
      PREWARM_POSITION.y,
      PREWARM_POSITION.z,
    );
    parkedDomeScene = scene;
    scene.add(parkedDome.object);
  }
  return parkedDome;
}

/** @deprecated Use runShaderPrewarm */
export async function prewarmCombatFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  await runShaderPrewarm(renderer, scene, camera);
}
