import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  ENEMY_OUTLINE_COLOR,
  EnemyOutlineFx,
} from '../effects/EnemyOutlineFx';
import { TeammateOutlineFx } from '../effects/TeammateOutlineFx';
import { TEAM_COLORS } from '../../shared/combat/teams';
import { updateLineResolution } from '../visuals/edgeLines';
import { AtmospherePass } from './AtmospherePass';
import { ScopeWorldBlurPass } from './ScopeWorldBlurPass';

export type MapLookPreset = 'default' | 'chrono_bowl';

function teamColorToHex(teamId: number): number {
  const css = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
  return Number.parseInt(css.slice(1), 16);
}

function configureOutlinePass(
  pass: OutlinePass,
  visibleColor: number,
  resolution: THREE.Vector2,
): void {
  pass.edgeStrength = 3.2;
  pass.edgeThickness = 1.25;
  pass.edgeGlow = 0.2;
  pass.pulsePeriod = 0;
  pass.visibleEdgeColor.setHex(visibleColor);
  // No through-wall x-ray — silhouette of the visible player only.
  pass.hiddenEdgeColor.setHex(0x000000);
  pass.resolution.set(
    Math.max(1, Math.floor(resolution.x * 0.5)),
    Math.max(1, Math.floor(resolution.y * 0.5)),
  );
}

export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  /** Cap DPR for TDM — OutlinePass + dual RT is very expensive at 2×. */
  private maxPixelRatio = 1.5;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private enemyOutlinePass: OutlinePass | null = null;
  private teammateOutlinePass: OutlinePass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private atmospherePass: AtmospherePass | null = null;
  private scopeWorldBlurPass: ScopeWorldBlurPass | null = null;
  private scopeWorldBlur = 0;
  private mapLook: MapLookPreset = 'default';
  private teammateOutlineColor = teamColorToHex(0);
  private readonly resolution = new THREE.Vector2();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
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

  /** Map-specific tone mapping + post FX (Chrono-Bowl cinematic dusk). */
  setMapLook(preset: MapLookPreset): void {
    this.mapLook = preset;
    this.applyMapLook();
  }

  /** 0–1 sniper ADS soft-focus on the main view. */
  setScopeWorldBlur(amount: number): void {
    this.scopeWorldBlur = THREE.MathUtils.clamp(amount, 0, 1);
    this.scopeWorldBlurPass?.setStrength(this.scopeWorldBlur);
  }

  /** Local team's color for teammate silhouettes (blue / orange). */
  setTeammateOutlineTeamId(teamId: number): void {
    const hex = teamColorToHex(teamId);
    if (hex === this.teammateOutlineColor) return;
    this.teammateOutlineColor = hex;
    this.teammateOutlinePass?.visibleEdgeColor.setHex(hex);
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.maxPixelRatio),
    );
  }

  private applyMapLook(): void {
    // Post FX off for all maps — atmosphere comes from fog + lighting only.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.atmospherePass?.applyDefault();
    if (this.bloomPass) this.bloomPass.enabled = false;
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) {
      this.renderPass!.scene = scene;
      this.renderPass!.camera = camera;
      this.enemyOutlinePass!.renderScene = scene;
      this.enemyOutlinePass!.renderCamera = camera;
      this.teammateOutlinePass!.renderScene = scene;
      this.teammateOutlinePass!.renderCamera = camera;
      return;
    }

    this.renderer.getSize(this.resolution);
    this.composer = new EffectComposer(this.renderer);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.enemyOutlinePass = new OutlinePass(this.resolution.clone(), scene, camera);
    configureOutlinePass(this.enemyOutlinePass, ENEMY_OUTLINE_COLOR, this.resolution);
    this.composer.addPass(this.enemyOutlinePass);

    this.teammateOutlinePass = new OutlinePass(this.resolution.clone(), scene, camera);
    configureOutlinePass(this.teammateOutlinePass, this.teammateOutlineColor, this.resolution);
    this.composer.addPass(this.teammateOutlinePass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.resolution.x, this.resolution.y),
      0.22,
      0.45,
      0.82,
    );
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    this.scopeWorldBlurPass = new ScopeWorldBlurPass();
    this.scopeWorldBlurPass.setStrength(this.scopeWorldBlur);
    this.composer.addPass(this.scopeWorldBlurPass);

    this.atmospherePass = new AtmospherePass();
    this.composer.addPass(this.atmospherePass);

    this.composer.addPass(new OutputPass());
    this.syncComposerSize();
    this.applyMapLook();
  }

  private syncComposerSize(): void {
    if (!this.composer || !this.enemyOutlinePass || !this.teammateOutlinePass) return;
    this.renderer.getSize(this.resolution);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.resolution.x, this.resolution.y);
    const halfW = Math.max(1, Math.floor(this.resolution.x * 0.5));
    const halfH = Math.max(1, Math.floor(this.resolution.y * 0.5));
    this.enemyOutlinePass.resolution.set(halfW, halfH);
    this.teammateOutlinePass.resolution.set(halfW, halfH);
    this.bloomPass?.resolution.set(this.resolution.x, this.resolution.y);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.ensureComposer(scene, camera);
    const enemies = EnemyOutlineFx.getSelectedRoots();
    const teammates = TeammateOutlineFx.getSelectedRoots();
    this.enemyOutlinePass!.selectedObjects = enemies;
    this.teammateOutlinePass!.selectedObjects = teammates;
    this.enemyOutlinePass!.enabled = enemies.length > 0;
    this.teammateOutlinePass!.enabled = teammates.length > 0;
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
