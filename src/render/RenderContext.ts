import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import {
  ENEMY_OUTLINE_COLOR,
  EnemyOutlineFx,
} from '../effects/EnemyOutlineFx';
import { updateLineResolution } from '../visuals/edgeLines';
import { ScopeWorldBlurPass } from './ScopeWorldBlurPass';
import { VignettePass } from './VignettePass';

export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private maxPixelRatio = 2;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private outlinePass: OutlinePass | null = null;
  private scopeWorldBlurPass: ScopeWorldBlurPass | null = null;
  private scopeWorldBlur = 0;
  private readonly resolution = new THREE.Vector2();

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
    this.syncComposerSize();
  }

  /** 0–1 sniper ADS soft-focus on the main view. */
  setScopeWorldBlur(amount: number): void {
    this.scopeWorldBlur = THREE.MathUtils.clamp(amount, 0, 1);
    this.scopeWorldBlurPass?.setStrength(this.scopeWorldBlur);
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.maxPixelRatio),
    );
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) {
      this.renderPass!.scene = scene;
      this.renderPass!.camera = camera;
      this.outlinePass!.renderScene = scene;
      this.outlinePass!.renderCamera = camera;
      return;
    }

    this.renderer.getSize(this.resolution);
    this.composer = new EffectComposer(this.renderer);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.outlinePass = new OutlinePass(this.resolution.clone(), scene, camera);
    this.outlinePass.edgeStrength = 4.5;
    this.outlinePass.edgeThickness = 2.0;
    this.outlinePass.edgeGlow = 0.55;
    this.outlinePass.pulsePeriod = 0;
    this.outlinePass.visibleEdgeColor.setHex(ENEMY_OUTLINE_COLOR);
    // No through-wall x-ray — silhouette of the visible player only.
    this.outlinePass.hiddenEdgeColor.setHex(0x000000);
    this.composer.addPass(this.outlinePass);

    this.scopeWorldBlurPass = new ScopeWorldBlurPass();
    this.scopeWorldBlurPass.setStrength(this.scopeWorldBlur);
    this.composer.addPass(this.scopeWorldBlurPass);

    this.composer.addPass(new VignettePass());
    this.composer.addPass(new OutputPass());
    this.syncComposerSize();
  }

  private syncComposerSize(): void {
    if (!this.composer || !this.outlinePass) return;
    this.renderer.getSize(this.resolution);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.resolution.x, this.resolution.y);
    this.outlinePass.resolution.set(this.resolution.x, this.resolution.y);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.ensureComposer(scene, camera);
    this.outlinePass!.selectedObjects = EnemyOutlineFx.getSelectedRoots();
    this.composer!.render();
    this.labelRenderer.render(scene, camera);
  }

  resize(): void {
    this.applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    updateLineResolution(window.innerWidth, window.innerHeight);
    this.syncComposerSize();
  }
}
