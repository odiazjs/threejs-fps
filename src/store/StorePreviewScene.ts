import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { disposeObject3D } from '../weapons/disposeMesh';

const ASSET_BASE = '/3d/';
const SHOWCASE_TARGET_HEIGHT = 2.35;
const DEFAULT_CAMERA_Z = 4.6;
const DEFAULT_CAMERA_Y = 1.05;

export class StorePreviewScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly modelPivot = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private currentModel: THREE.Object3D | null = null;
  private currentAssetKey: string | null = null;
  private loadToken = 0;
  private animationId = 0;
  private disposed = false;
  private resizeRetryId = 0;
  private lastSyncWidth = 0;
  private lastSyncHeight = 0;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private readyResolved = false;

  constructor(private readonly container: HTMLElement) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 100);
    this.camera.position.set(0.85, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(1, 1, false);
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.target.set(0, 0.95, 0);

    this.scene.background = createSkyboxTexture();

    const hemi = new THREE.HemisphereLight(0xb8d4e8, 0x2a3038, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(2.2, 4.2, 2.8);
    const fill = new THREE.DirectionalLight(0x82dbdb, 0.6);
    fill.position.set(-2.8, 1.8, -1.5);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(0, 2.4, -3.5);
    this.scene.add(hemi, key, fill, rim);

    const pedestal = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a2228,
        metalness: 0.35,
        roughness: 0.82,
      }),
    );
    pedestal.rotation.x = -Math.PI / 2;
    pedestal.position.y = 0;
    this.scene.add(pedestal);
    this.scene.add(this.modelPivot);

    this.resizeObserver = new ResizeObserver(() => {
      this.syncViewport();
    });
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.onResize);
    this.syncViewport();
    this.scheduleReadyAfterRender();
    this.loop();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  refreshViewport(): void {
    this.syncViewport(true);
    requestAnimationFrame(() => {
      if (this.disposed) return;
      this.syncViewport(true);
    });
  }

  async showAsset(assetFile: string | null): Promise<void> {
    const key = assetFile?.trim() || '';
    if (!key) {
      this.clearModel();
      this.currentAssetKey = null;
      return;
    }
    if (key === this.currentAssetKey && this.currentModel) return;

    const token = ++this.loadToken;
    const loader = new FBXLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const fbx = await new Promise<THREE.Group>((resolve, reject) => {
        loader.load(
          `${ASSET_BASE}${encodeURIComponent(key)}`,
          (object) => resolve(object as THREE.Group),
          undefined,
          reject,
        );
      });
      if (this.disposed || token !== this.loadToken) {
        disposeObject3D(fbx);
        return;
      }

      this.clearModel();
      const fitted = this.fitModel(fbx);
      this.modelPivot.add(fitted);
      this.currentModel = fitted;
      this.currentAssetKey = key;
      this.resetOrbit();
    } catch (error) {
      console.warn('[StorePreviewScene] Failed to load asset', key, error);
      if (token === this.loadToken) {
        this.clearModel();
        this.currentAssetKey = null;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.animationId);
    cancelAnimationFrame(this.resizeRetryId);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.clearModel();

    this.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const { material } = child;
      if (Array.isArray(material)) {
        for (const entry of material) entry.dispose();
      } else {
        material.dispose();
      }
    });

    this.controls.dispose();
    const background = this.scene.background;
    if (background instanceof THREE.Texture) {
      background.dispose();
    }
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private fitModel(model: THREE.Group): THREE.Group {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Face the camera (Mixamo / FBX usually faces +Z toward the lens after fit).
    model.rotation.y = 0;
    model.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = SHOWCASE_TARGET_HEIGHT / Math.max(size.y, 0.001);

    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(scale);
    wrapper.updateMatrixWorld(true);

    const fitted = new THREE.Box3().setFromObject(wrapper);
    const center = fitted.getCenter(new THREE.Vector3());
    wrapper.position.set(-center.x, -fitted.min.y, -center.z);
    return wrapper;
  }

  private clearModel(): void {
    if (!this.currentModel) return;
    disposeObject3D(this.currentModel);
    this.currentModel = null;
  }

  private resetOrbit(): void {
    this.controls.target.set(0, 0.95, 0);
    this.camera.position.set(0.85, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);
    this.controls.update();
  }

  private scheduleReadyAfterRender(): void {
    if (this.readyResolved || this.disposed) return;
    requestAnimationFrame(() => {
      if (this.disposed) return;
      this.syncViewport();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(() => {
        if (this.readyResolved || this.disposed) return;
        this.syncViewport();
        this.readyResolved = true;
        this.resolveReady();
      });
    });
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.syncViewport();
  };

  private syncViewport(force = false): void {
    if (this.disposed) return;

    const w = Math.max(0, Math.floor(this.container.clientWidth));
    const h = Math.max(0, Math.floor(this.container.clientHeight));
    if (w < 2 || h < 2) {
      cancelAnimationFrame(this.resizeRetryId);
      this.resizeRetryId = requestAnimationFrame(() => this.syncViewport(force));
      return;
    }

    if (!force && w === this.lastSyncWidth && h === this.lastSyncHeight) return;
    this.lastSyncWidth = w;
    this.lastSyncHeight = h;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
  }
}
