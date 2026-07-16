import * as THREE from 'three';

/**
 * Fixed pool of scene-level point lights shared by all combat/VFX systems.
 *
 * WHY: three.js keys every lit shader program on the number of visible
 * lights. If an effect adds (or reveals) its own PointLight at first use,
 * every lit material in the scene — the whole map — recompiles on that
 * frame, which reads as a huge freeze on the first shot / hit / explosion.
 *
 * The pool keeps a constant number of always-visible lights in the scene
 * from load time (included in the shader prewarm pass), so the light count
 * never changes at runtime and no recompiles can be triggered by VFX.
 * Effects borrow a light with `acquireFxLight`, drive its position/color/
 * intensity while active, and hand it back with `releaseFxLight`.
 */
const POOL_SIZE = 8;
const PARK_POSITION = new THREE.Vector3(0, -10_000, 0);

interface PoolState {
  scene: THREE.Scene;
  lights: THREE.PointLight[];
  free: THREE.PointLight[];
}

let state: PoolState | null = null;

export function initFxLightPool(scene: THREE.Scene): void {
  if (state?.scene === scene) return;

  state = { scene, lights: [], free: [] };
  for (let i = 0; i < POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 1, 2);
    light.name = `fx-pool-light-${i}`;
    light.position.copy(PARK_POSITION);
    scene.add(light);
    state.lights.push(light);
    state.free.push(light);
  }
}

/** @returns null when the pool is exhausted — effects must tolerate no light. */
export function acquireFxLight(
  color: THREE.ColorRepresentation,
  distance: number,
  decay = 2,
): THREE.PointLight | null {
  const light = state?.free.pop() ?? null;
  if (!light) return null;

  light.color.set(color);
  light.distance = distance;
  light.decay = decay;
  light.intensity = 0;
  return light;
}

export function releaseFxLight(light: THREE.PointLight | null): void {
  if (!light || !state || !state.lights.includes(light)) return;

  light.intensity = 0;
  light.position.copy(PARK_POSITION);
  if (!state.free.includes(light)) state.free.push(light);
}
