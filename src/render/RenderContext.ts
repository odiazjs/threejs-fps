import * as THREE from 'three';
import { updateLineResolution } from '../visuals/edgeLines';

export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(this.renderer.domElement);
    updateLineResolution(window.innerWidth, window.innerHeight);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    updateLineResolution(window.innerWidth, window.innerHeight);
  }
}
