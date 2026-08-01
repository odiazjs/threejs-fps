import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/**
 * Bake / server collision only needs mesh geometry. KTX2 textures in the GLB
 * still force GLTFLoader to call setKTX2Loader � provide a stub that returns
 * a 1�1 placeholder instead of running the Basis transcoder in Node.
 */
function createStubKtx2Loader(): KTX2Loader {
  const stub = {
    detectSupport() {
      return stub;
    },
    load(
      _url: string,
      onLoad: (texture: THREE.Texture) => void,
      _onProgress?: (event: ProgressEvent) => void,
      onError?: (err: unknown) => void,
    ) {
      try {
        onLoad(makePlaceholderTexture());
      } catch (error) {
        onError?.(error);
      }
    },
    parse(
      _buffer: ArrayBuffer,
      onLoad: (texture: THREE.Texture) => void,
      onError?: (err: unknown) => void,
    ) {
      try {
        onLoad(makePlaceholderTexture());
      } catch (error) {
        onError?.(error);
      }
    },
    dispose() {
      // no-op
    },
  };
  return stub as unknown as KTX2Loader;
}

function makePlaceholderTexture(): THREE.DataTexture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  return texture;
}

/** GLTFLoader safe for Node bake scripts (KTX2 GLBs included). */
export function createNodeGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setKTX2Loader(createStubKtx2Loader());
  return loader;
}
