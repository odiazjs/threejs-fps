import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { updateLineResolution } from '../visuals/edgeLines';

export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private maxPixelRatio = 2;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(this.labelRenderer.domElement);

    updateLineResolution(window.innerWidth, window.innerHeight);
  }

  setMaxPixelRatio(ratio: number): void {
    this.maxPixelRatio = Math.max(1, ratio);
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.maxPixelRatio),
    );
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
    this.labelRenderer.render(scene, camera);
  }

  resize(): void {
    this.applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    updateLineResolution(window.innerWidth, window.innerHeight);
  }
}
