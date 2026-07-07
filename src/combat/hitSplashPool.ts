import * as THREE from 'three';
import { HitSplash, type HitSplashKind } from './HitSplash';
import { MAX_CONCURRENT_SPLASHES } from './projectileConfig';

const IDLE_POSITION = new THREE.Vector3(0, -10_000, 0);
const POOL_CAPACITY: Record<HitSplashKind, number> = {
  world: MAX_CONCURRENT_SPLASHES,
  player: MAX_CONCURRENT_SPLASHES,
};

const pools: Record<HitSplashKind, HitSplash[]> = {
  world: [],
  player: [],
};

let sceneRef: THREE.Scene | null = null;
let poolInitialized = false;

function hideSplash(splash: HitSplash): void {
  splash.object.visible = false;
  splash.object.position.copy(IDLE_POSITION);
}

export function warmHitSplashPool(): void {
  for (const kind of ['world', 'player'] as const) {
    while (pools[kind].length < POOL_CAPACITY[kind]) {
      pools[kind].push(new HitSplash(IDLE_POSITION, kind));
    }
  }
}

/** Keep every pooled splash in the scene graph so GPU buffers stay resident. */
export function initHitSplashPool(scene: THREE.Scene): void {
  if (poolInitialized && sceneRef === scene) return;

  sceneRef = scene;
  warmHitSplashPool();

  for (const kind of ['world', 'player'] as const) {
    for (const splash of pools[kind]) {
      if (splash.object.parent !== scene) {
        scene.add(splash.object);
      }
      hideSplash(splash);
    }
  }

  poolInitialized = true;
}

const _cameraForward = new THREE.Vector3();
const _prewarmPoint = new THREE.Vector3();

function renderPrewarmFrames(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  frameCount: number,
): void {
  for (let frame = 0; frame < frameCount; frame += 1) {
    renderer.render(scene, camera);
  }
}

/**
 * Draw every pooled splash and run a full player-hit cycle so shaders, VBOs,
 * and the acquire/restart/update path are exercised before the first combat hit.
 */
export async function prewarmHitSplashesGpu(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  initHitSplashPool(scene);

  camera.getWorldPosition(_prewarmPoint);
  camera.getWorldDirection(_cameraForward);
  _prewarmPoint.addScaledVector(_cameraForward, 6);

  const batch: HitSplash[] = [];
  for (const kind of ['world', 'player'] as const) {
    for (const splash of pools[kind]) {
      batch.push(splash);
      splash.object.visible = true;
      splash.restart(_prewarmPoint);
      splash.update(1 / 60);
    }
  }

  await renderer.compileAsync(scene, camera);
  renderPrewarmFrames(renderer, scene, camera, 3);

  for (const splash of batch) {
    hideSplash(splash);
  }

  const prime = acquireHitSplash(_prewarmPoint, 'player');
  prime.object.visible = true;
  const primeSteps = Math.ceil(0.52 * 60);
  for (let step = 0; step < primeSteps; step += 1) {
    prime.update(1 / 60);
  }
  renderPrewarmFrames(renderer, scene, camera, 2);
  releaseHitSplash(prime);
}

export function acquireHitSplash(point: THREE.Vector3, kind: HitSplashKind): HitSplash {
  if (sceneRef) {
    initHitSplashPool(sceneRef);
  }

  let splash = pools[kind].pop();
  if (!splash) {
    splash = new HitSplash(point, kind);
    sceneRef?.add(splash.object);
  } else {
    splash.restart(point);
  }

  splash.object.visible = true;
  return splash;
}

export function releaseHitSplash(splash: HitSplash): void {
  const kind = splash.kind;
  hideSplash(splash);

  if (pools[kind].length < POOL_CAPACITY[kind]) {
    pools[kind].push(splash);
    return;
  }

  splash.disposePermanent();
}
