import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { resolveFaceIdForCharacter } from '../content/characterFaces';
import {
  SHOWCASE_IDLE_FILE,
  showcaseIdleFileForMesh,
} from '../content/characterShowcaseIdle';
import {
  applyMeshyCharacterMaterial,
  isSharedCharacterMesh,
} from '../content/meshyCharacterMaterial';
import { DEFAULT_CHARACTER_ITEM_ID } from '../../shared/content/storeItemTypes';
import { applyCharacterFace } from '../player/characterFace';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { disposeObject3D } from '../weapons/disposeMesh';

const ASSET_BASE = '/3d/';
const SHOWCASE_TARGET_HEIGHT = 2.35;
const DEFAULT_CAMERA_X = 0.85;
const DEFAULT_CAMERA_Z = 4.6;
const DEFAULT_CAMERA_Y = 1.05;
/** Character pedestal yaw — three-quarter view toward the camera. */
const CHARACTER_YAW_RAD = (45 * Math.PI) / 180;
/** Pull the character camera back vs default framing. */
const CHARACTER_CAMERA_ZOOM_OUT = 1.25;
/** Characters-page close-up: camera offset from the face focus point. */
const FACE_FOCUS_CAMERA_OFFSET = new THREE.Vector3(0.322, 0.069, 1.08);
const FACE_FOCUS_MIN_DISTANCE = 0.55;
const FACE_FOCUS_MAX_DISTANCE = 2.4;

export type StorePreviewOptions = {
  /** Play a store idle clip (character unlockables). */
  playShowcaseIdle?: boolean;
  /** Operator character id — selects which face head to attach. */
  characterId?: string;
  /** Store skin item id — selects body emissive texture on the shared mesh. */
  skinId?: string;
  /** Frame camera on the attached face (Characters page). */
  focusFace?: boolean;
};

function pickAnimationClip(animations: THREE.AnimationClip[]): THREE.AnimationClip | null {
  if (animations.length === 0) return null;
  return (
    animations.find((clip) => /idle|showcase|stand/i.test(clip.name)) ??
    animations[0] ??
    null
  );
}

/** Drop hips/root translation so the pedestal character stays planted. */
function stripRootMotionFromClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const dot = track.name.indexOf('.');
    if (dot === -1) return true;
    const boneName = track.name.slice(0, dot).replace(/^mixamorig:?/i, '');
    const property = track.name.slice(dot + 1);
    if (property !== 'position') return true;
    return !/^(Hips|Root)$/i.test(boneName);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function loadFbx(loader: FBXLoader, url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (object) => resolve(object as THREE.Group), undefined, reject);
  });
}

/** Prefer the attached face mesh; fall back to the upper ~head band of the body. */
function resolveFaceFocusPoint(root: THREE.Object3D): THREE.Vector3 {
  const faceAttach = root.getObjectByName('characterFaceAttach');
  if (faceAttach) {
    const box = new THREE.Box3().setFromObject(faceAttach);
    if (!box.isEmpty()) {
      return box.getCenter(new THREE.Vector3());
    }
    return faceAttach.getWorldPosition(new THREE.Vector3());
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return new THREE.Vector3(
    (box.min.x + box.max.x) * 0.5,
    box.min.y + size.y * 0.92,
    (box.min.z + box.max.z) * 0.5,
  );
}

export class StorePreviewScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly modelPivot = new THREE.Group();
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private currentModel: THREE.Object3D | null = null;
  private currentAssetKey: string | null = null;
  private currentOperatorId: string | null = null;
  private currentSkinId: string | null = null;
  private currentIdleFile: string | null = null;
  private currentPlayIdle = false;
  private currentFocusFace = false;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly idleClipCache = new Map<string, THREE.AnimationClip>();
  private readonly idleClipPromises = new Map<string, Promise<THREE.AnimationClip | null>>();
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
    this.camera.position.set(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);

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
    // Warm the default showcase clip so the first character preview is snappy.
    void this.loadIdleClip(SHOWCASE_IDLE_FILE);
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

  async showAsset(assetFile: string | null, options: StorePreviewOptions = {}): Promise<void> {
    const key = assetFile?.trim() || '';
    const playIdle = Boolean(options.playShowcaseIdle);
    const idleFile = playIdle ? showcaseIdleFileForMesh(key) : null;
    const operatorId = options.characterId?.trim() || '';
    const skinId = options.skinId?.trim() || '';
    const focusFace = Boolean(options.focusFace);
    if (!key) {
      this.clearModel();
      this.currentAssetKey = null;
      this.currentOperatorId = null;
      this.currentSkinId = null;
      this.currentIdleFile = null;
      this.currentPlayIdle = false;
      this.currentFocusFace = false;
      this.applyOrbitLimits(false);
      this.resetOrbit(1);
      return;
    }
    if (
      key === this.currentAssetKey &&
      this.currentModel &&
      playIdle === this.currentPlayIdle &&
      idleFile === this.currentIdleFile &&
      operatorId === (this.currentOperatorId ?? '') &&
      skinId === (this.currentSkinId ?? '') &&
      focusFace === this.currentFocusFace
    ) {
      return;
    }

    const token = ++this.loadToken;
    const loader = new FBXLoader();
    loader.setResourcePath(ASSET_BASE);

    try {
      const useEmbeddedIdle = Boolean(idleFile && idleFile === key);
      const [fbx, separateIdleClip] = await Promise.all([
        loadFbx(loader, `${ASSET_BASE}${encodeURIComponent(key)}`),
        idleFile && !useEmbeddedIdle
          ? this.loadIdleClip(idleFile)
          : Promise.resolve(null),
      ]);
      if (this.disposed || token !== this.loadToken) {
        disposeObject3D(fbx);
        return;
      }

      if (isSharedCharacterMesh(key)) {
        await applyMeshyCharacterMaterial(fbx, skinId || DEFAULT_CHARACTER_ITEM_ID);
        if (this.disposed || token !== this.loadToken) {
          disposeObject3D(fbx);
          return;
        }
      }

      const embedded = useEmbeddedIdle ? pickAnimationClip(fbx.animations) : null;
      const idleClip =
        (embedded ? stripRootMotionFromClip(embedded) : null) ?? separateIdleClip;

      this.clearModel();

      let mixer: THREE.AnimationMixer | null = null;
      if (playIdle && idleClip) {
        mixer = new THREE.AnimationMixer(fbx);
        const action = mixer.clipAction(idleClip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        // Pose before fitting so framing matches the idle stance, not T-pose.
        mixer.update(0);
      }

      const fitted = this.fitModel(fbx, playIdle ? CHARACTER_YAW_RAD : 0);
      if (playIdle) {
        await applyCharacterFace(
          fitted,
          resolveFaceIdForCharacter(options.characterId ?? ''),
        );
        if (this.disposed || token !== this.loadToken) {
          disposeObject3D(fitted);
          return;
        }
      }
      this.modelPivot.add(fitted);
      this.currentModel = fitted;
      this.currentAssetKey = key;
      this.currentOperatorId = operatorId;
      this.currentSkinId = skinId;
      this.currentIdleFile = idleFile;
      this.currentPlayIdle = playIdle;
      this.currentFocusFace = focusFace;
      this.mixer = mixer;
      this.applyOrbitLimits(focusFace);
      if (focusFace) {
        this.resetOrbitToFace(fitted);
      } else {
        this.resetOrbit(playIdle ? CHARACTER_CAMERA_ZOOM_OUT : 1);
      }
    } catch (error) {
      console.warn('[StorePreviewScene] Failed to load asset', key, error);
      if (token === this.loadToken) {
        this.clearModel();
        this.currentAssetKey = null;
        this.currentOperatorId = null;
        this.currentSkinId = null;
        this.currentIdleFile = null;
        this.currentPlayIdle = false;
        this.currentFocusFace = false;
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

  private async loadIdleClip(idleFile: string): Promise<THREE.AnimationClip | null> {
    const cached = this.idleClipCache.get(idleFile);
    if (cached) return cached;

    const pending = this.idleClipPromises.get(idleFile);
    if (pending) return pending;

    const promise = (async () => {
      const loader = new FBXLoader();
      loader.setResourcePath(ASSET_BASE);
      const fbx = await loadFbx(loader, `${ASSET_BASE}${encodeURIComponent(idleFile)}`);
      const raw = pickAnimationClip(fbx.animations);
      const clip = raw ? stripRootMotionFromClip(raw) : null;
      // Animation FBX — dispose mesh data; keep the clip.
      disposeObject3D(fbx);
      if (clip) this.idleClipCache.set(idleFile, clip);
      return clip;
    })()
      .catch((error) => {
        console.warn('[StorePreviewScene] Failed to load idle clip', idleFile, error);
        // Per-mesh idle missing → fall back to shared showcase clip.
        if (idleFile !== SHOWCASE_IDLE_FILE) {
          return this.loadIdleClip(SHOWCASE_IDLE_FILE);
        }
        return null;
      })
      .finally(() => {
        this.idleClipPromises.delete(idleFile);
      });

    this.idleClipPromises.set(idleFile, promise);
    return promise;
  }

  private fitModel(model: THREE.Group, yawRad = 0): THREE.Group {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    model.rotation.y = yawRad;
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
    this.mixer?.stopAllAction();
    this.mixer = null;
    if (!this.currentModel) return;
    disposeObject3D(this.currentModel);
    this.currentModel = null;
  }

  private applyOrbitLimits(focusFace: boolean): void {
    if (focusFace) {
      this.controls.minDistance = FACE_FOCUS_MIN_DISTANCE;
      this.controls.maxDistance = FACE_FOCUS_MAX_DISTANCE;
      this.controls.minPolarAngle = 0.55;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.15;
      return;
    }
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
  }

  private resetOrbit(zoomOut = 1): void {
    this.controls.target.set(0, 0.95, 0);
    this.camera.position.set(
      DEFAULT_CAMERA_X * zoomOut,
      DEFAULT_CAMERA_Y,
      DEFAULT_CAMERA_Z * zoomOut,
    );
    this.controls.update();
  }

  private resetOrbitToFace(model: THREE.Object3D): void {
    const focus = resolveFaceFocusPoint(model);
    this.controls.target.copy(focus);
    this.camera.position.set(
      focus.x + FACE_FOCUS_CAMERA_OFFSET.x,
      focus.y + FACE_FOCUS_CAMERA_OFFSET.y,
      focus.z + FACE_FOCUS_CAMERA_OFFSET.z,
    );
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
    const delta = this.clock.getDelta();
    this.mixer?.update(delta);
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
