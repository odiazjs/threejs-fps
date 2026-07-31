import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** Served from `public/basis/` (see `npm run sync:basis`). */
const BASIS_TRANSCODER_PATH = '/basis/';

let ktx2Loader: KTX2Loader | null = null;
let supportDetected = false;

function getKtx2Loader(): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH);
  }
  return ktx2Loader;
}

/**
 * Bind GPU compressed-texture support for KTX2/Basis GLBs.
 * Call once the WebGLRenderer exists (lobby, game, prewarm).
 */
export function bindGltfKtx2Renderer(renderer: WebGLRenderer): void {
  getKtx2Loader().detectSupport(renderer);
  supportDetected = true;
}

/** True after {@link bindGltfKtx2Renderer} has run for a renderer. */
export function isGltfKtx2SupportReady(): boolean {
  return supportDetected;
}

/**
 * GLTFLoader with KTX2/Basis decoding enabled.
 * Prefer calling {@link bindGltfKtx2Renderer} before loading KTX2 assets.
 */
export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setKTX2Loader(getKtx2Loader());
  return loader;
}
