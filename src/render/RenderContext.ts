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
import { HarvestingBoxOutlineFx } from '../effects/HarvestingBoxOutlineFx';
import {
  HARVEST_TEAM_VIVID_COLORS,
  TEAM_COLORS,
} from '../../shared/combat/teams';
import { updateLineResolution } from '../visuals/edgeLines';
import { AtmospherePass } from './AtmospherePass';
import {
  ScopeCircleBlurPass,
  type ScopeCircleBlurParams,
} from './ScopeCircleBlurPass';
import { bindGltfKtx2Renderer } from '../content/gltfLoader';
import { bindTextureQualityRenderer } from '../content/textureQuality';
import {
  getGraphicsQualitySummary,
  resolveGraphicsQuality,
} from './graphicsQuality';

export type MapLookPreset = 'default' | 'chrono_bowl';

function teamColorToHex(teamId: number): number {
  const css = TEAM_COLORS[teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
  return Number.parseInt(css.slice(1), 16);
}

function harvestVividColorToHex(teamId: number): number {
  const css =
    HARVEST_TEAM_VIVID_COLORS[teamId % HARVEST_TEAM_VIVID_COLORS.length] ??
    HARVEST_TEAM_VIVID_COLORS[0]!;
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
  pass.hiddenEdgeColor.setRGB(0, 0, 0);
  pass.resolution.set(
    Math.max(1, Math.floor(resolution.x * 0.5)),
    Math.max(1, Math.floor(resolution.y * 0.5)),
  );
}

/** Strong pulsing silhouette for harvesting crates (team-colored, no x-ray). */
function configureHarvestBoxOutlinePass(
  pass: OutlinePass,
  visibleColor: number,
  resolution: THREE.Vector2,
): void {
  // Saturated edge + stronger pulse; keep glow modest so it doesn't x-ray.
  pass.edgeStrength = 12;
  pass.edgeThickness = 3.1;
  pass.edgeGlow = 0.35;
  pass.pulsePeriod = 1.4;
  pass.visibleEdgeColor.setHex(visibleColor);
  // Additive black = invisible; occluded silhouette must not draw.
  pass.hiddenEdgeColor.setRGB(0, 0, 0);
  pass.resolution.set(
    Math.max(1, Math.floor(resolution.x * 0.5)),
    Math.max(1, Math.floor(resolution.y * 0.5)),
  );
}

export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  /** Cap DPR — OutlinePass + dual RT is very expensive at 2×. */
  private maxPixelRatio: number;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private enemyOutlinePass: OutlinePass | null = null;
  private teammateOutlinePass: OutlinePass | null = null;
  private harvestBoxBlueOutlinePass: OutlinePass | null = null;
  private harvestBoxOrangeOutlinePass: OutlinePass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private atmospherePass: AtmospherePass | null = null;
  private scopeCircleBlurPass: ScopeCircleBlurPass | null = null;
  private scopeBlurParams: ScopeCircleBlurParams | null = null;
  private teammateOutlineColor = teamColorToHex(0);
  private readonly resolution = new THREE.Vector2();
  private readonly outlinesEnabled: boolean;
  private readonly teammateOutlinesEnabled: boolean;

  constructor() {
    const quality = resolveGraphicsQuality();
    this.maxPixelRatio = quality.gameMaxPixelRatio;
    this.outlinesEnabled = quality.outlinesEnabled;
    this.teammateOutlinesEnabled = quality.teammateOutlinesEnabled;

    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    bindTextureQualityRenderer(this.renderer);
    bindGltfKtx2Renderer(this.renderer);
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
    console.info(`[Graphics] ${getGraphicsQualitySummary()}`);
  }

  setMaxPixelRatio(ratio: number): void {
    this.maxPixelRatio = Math.max(1, ratio);
    this.applyPixelRatio();
    this.syncComposerSize();
  }

  /** Map-specific tone mapping + post FX. */
  setMapLook(_preset: MapLookPreset): void {
    this.applyMapLook();
  }

  /** Local team's color for teammate silhouettes (blue / orange). */
  setTeammateOutlineTeamId(teamId: number): void {
    const hex = teamColorToHex(teamId);
    if (hex === this.teammateOutlineColor) return;
    this.teammateOutlineColor = hex;
    this.teammateOutlinePass?.visibleEdgeColor.setHex(hex);
  }

  /** Sniper ADS: blur outside the optic circle; sharp inside. */
  setScopeCircleBlur(params: ScopeCircleBlurParams | null): void {
    this.scopeBlurParams = params?.enabled ? params : null;
    this.scopeCircleBlurPass?.setScopeBlur(this.scopeBlurParams);
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
      this.harvestBoxBlueOutlinePass!.renderScene = scene;
      this.harvestBoxBlueOutlinePass!.renderCamera = camera;
      this.harvestBoxOrangeOutlinePass!.renderScene = scene;
      this.harvestBoxOrangeOutlinePass!.renderCamera = camera;
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

    this.harvestBoxBlueOutlinePass = new OutlinePass(
      this.resolution.clone(),
      scene,
      camera,
    );
    configureHarvestBoxOutlinePass(
      this.harvestBoxBlueOutlinePass,
      harvestVividColorToHex(0),
      this.resolution,
    );
    this.composer.addPass(this.harvestBoxBlueOutlinePass);

    this.harvestBoxOrangeOutlinePass = new OutlinePass(
      this.resolution.clone(),
      scene,
      camera,
    );
    configureHarvestBoxOutlinePass(
      this.harvestBoxOrangeOutlinePass,
      harvestVividColorToHex(1),
      this.resolution,
    );
    this.composer.addPass(this.harvestBoxOrangeOutlinePass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.resolution.x, this.resolution.y),
      0.22,
      0.45,
      0.82,
    );
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    this.atmospherePass = new AtmospherePass();
    this.composer.addPass(this.atmospherePass);

    this.scopeCircleBlurPass = new ScopeCircleBlurPass();
    this.scopeCircleBlurPass.setScopeBlur(this.scopeBlurParams);
    this.composer.addPass(this.scopeCircleBlurPass);

    this.composer.addPass(new OutputPass());
    this.syncComposerSize();
    this.applyMapLook();
  }

  private syncComposerSize(): void {
    if (
      !this.composer ||
      !this.enemyOutlinePass ||
      !this.teammateOutlinePass ||
      !this.harvestBoxBlueOutlinePass ||
      !this.harvestBoxOrangeOutlinePass
    ) {
      return;
    }
    this.renderer.getSize(this.resolution);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.resolution.x, this.resolution.y);
    const halfW = Math.max(1, Math.floor(this.resolution.x * 0.5));
    const halfH = Math.max(1, Math.floor(this.resolution.y * 0.5));
    this.enemyOutlinePass.resolution.set(halfW, halfH);
    this.teammateOutlinePass.resolution.set(halfW, halfH);
    this.harvestBoxBlueOutlinePass.resolution.set(halfW, halfH);
    this.harvestBoxOrangeOutlinePass.resolution.set(halfW, halfH);
    this.bloomPass?.resolution.set(this.resolution.x, this.resolution.y);
  }

  private needsComposer(
    enemies: THREE.Object3D[],
    teammates: THREE.Object3D[],
    blueBoxes: THREE.Object3D[],
    orangeBoxes: THREE.Object3D[],
  ): boolean {
    if (this.scopeBlurParams?.enabled) return true;
    if (!this.outlinesEnabled) return false;
    if (enemies.length > 0) return true;
    if (this.teammateOutlinesEnabled && teammates.length > 0) return true;
    if (blueBoxes.length > 0 || orangeBoxes.length > 0) return true;
    return false;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const enemies = this.outlinesEnabled ? EnemyOutlineFx.getSelectedRoots() : [];
    const teammates =
      this.outlinesEnabled && this.teammateOutlinesEnabled
        ? TeammateOutlineFx.getSelectedRoots()
        : [];
    const blueBoxes = this.outlinesEnabled
      ? HarvestingBoxOutlineFx.getBlueRoots()
      : [];
    const orangeBoxes = this.outlinesEnabled
      ? HarvestingBoxOutlineFx.getOrangeRoots()
      : [];

    if (!this.needsComposer(enemies, teammates, blueBoxes, orangeBoxes)) {
      this.renderer.render(scene, camera);
      this.labelRenderer.render(scene, camera);
      return;
    }

    this.ensureComposer(scene, camera);
    this.scopeCircleBlurPass?.setScopeBlur(this.scopeBlurParams);
    this.enemyOutlinePass!.selectedObjects = enemies;
    this.teammateOutlinePass!.selectedObjects = teammates;
    this.harvestBoxBlueOutlinePass!.selectedObjects = blueBoxes;
    this.harvestBoxOrangeOutlinePass!.selectedObjects = orangeBoxes;
    this.enemyOutlinePass!.enabled = enemies.length > 0;
    this.teammateOutlinePass!.enabled = teammates.length > 0;
    this.harvestBoxBlueOutlinePass!.enabled = blueBoxes.length > 0;
    this.harvestBoxOrangeOutlinePass!.enabled = orangeBoxes.length > 0;
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
