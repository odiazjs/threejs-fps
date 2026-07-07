import * as THREE from 'three';

/** Tiny offscreen renderer used only during first-load asset prewarm. */
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

export function getPrewarmRenderContext(): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(2, 2);
    renderer.setPixelRatio(1);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(0, 0, 5);
  }

  return {
    renderer: renderer!,
    scene: scene!,
    camera: camera!,
  };
}
