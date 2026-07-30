import * as THREE from 'three';
import { resolveGraphicsQuality } from '../render/graphicsQuality';

/**
 * Fixed pool of scene-level point lights shared by all combat/VFX systems.
 *
 * WHY: three.js keys every lit shader program on the number of visible
 * lights. If an effect adds (or reveals) its own PointLight at first use,
 * every lit material in the scene — the whole map — recompiles on that
 * frame, which reads as a huge freeze on the first shot / hit / explosion.
 *
 * Pool size follows graphics quality (2 / 4 / 8) and stays constant for the
 * match so shaders prewarmed at load never see a light-count change.
 */
const PARK_POSITION = new THREE.Vector3(0, -10_000, 0);

interface PoolState {
  scene: THREE.Scene;
  lights: THREE.PointLight[];
  free: THREE.PointLight[];
  size: number;
}

let state: PoolState | null = null;

export function getFxLightPoolSize(): number {
  return resolveGraphicsQuality().fxLightPoolSize;
}

export function initFxLightPool(scene: THREE.Scene): void {
  const size = getFxLightPoolSize();
  if (state?.scene === scene && state.size === size) return;

  if (state) {
    for (const light of state.lights) {
      state.scene.remove(light);
      light.dispose();
    }
  }

  state = { scene, lights: [], free: [], size };
  for (let i = 0; i < size; i++) {
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
