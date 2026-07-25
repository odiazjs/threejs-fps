import * as THREE from 'three';
import { SCOPE_CAMERA_DECAL_NAME } from '../content/physicalWeaponSights';

export { SCOPE_CAMERA_DECAL_NAME };

const ADS_BLEND_SHOW = 0.08;
const RT_HEIGHT = 720;
/**
 * A scope lens only covers a fraction of the screen. The same FOV that feels
 * "zoomed" fullscreen reads as zoomed-OUT inside that small circle next to the
 * hip FOV view. Tighten further so the glass shows real sniper magnification.
 */
/** Higher = less magnification. 0.33 * 1.15 ≈ 15% less zoom. */
const SCOPE_PIP_FOV_SCALE = 0.3795;
/** HUD neon cyan — matches `.crosshair-ads-dot`. */
const SCOPE_RETICLE_COLOR = 0x2efcff;
/** Reticle bar thickness in lens-local units (circle radius = 1). */
const SCOPE_RETICLE_THICKNESS = 0.005;

const _decalPos = new THREE.Vector3();
const _decalSize = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _box = new THREE.Box3();

/**
 * Sniper optic zoom feed.
 *
 * - Scope camera shares the main camera's world pose / aspect (crosshair = RT center).
 * - Display is a clean camera-facing circle (not the authored mesh UVs), so the
 *   feed is upright, undistorted, and aimed at the same point as the crosshair.
 */
export class ScopeLens {
  private readonly renderTarget: THREE.WebGLRenderTarget;
  private readonly scopeCamera: THREE.PerspectiveCamera;
  private readonly lensMaterial: THREE.MeshBasicMaterial;
  private readonly reticleMaterial: THREE.MeshBasicMaterial;
  private readonly lensMesh: THREE.Mesh;
  private readonly reticleRoot: THREE.Group;
  private readonly lensGeometry: THREE.CircleGeometry;
  private readonly reticleHGeometry: THREE.PlaneGeometry;
  private readonly reticleVGeometry: THREE.PlaneGeometry;

  private decal: THREE.Mesh | null = null;
  private previousMaterial: THREE.Material | THREE.Material[] | null = null;
  private boundWeapon: THREE.Object3D | null = null;
  private adsBlend = 0;
  private adsFov = 18;
  private hideRoot: THREE.Object3D | null = null;
  private lensRadius = 0.02;

  constructor() {
    this.renderTarget = new THREE.WebGLRenderTarget(RT_HEIGHT, RT_HEIGHT, {
      depthBuffer: true,
    });
    const map = this.renderTarget.texture;
    map.colorSpace = THREE.SRGBColorSpace;
    // RT is already upright for a camera-facing quad — no UV hacks.
    map.flipY = false;
    map.needsUpdate = true;

    this.scopeCamera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);

    this.lensMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map,
      // Front face only — DoubleSide would show a mirrored back face.
      side: THREE.FrontSide,
      toneMapped: false,
      fog: false,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    // Unit circle, UVs 0–1, center = (0.5, 0.5) = aim point / crosshair.
    this.lensGeometry = new THREE.CircleGeometry(1, 64);
    this.lensMesh = new THREE.Mesh(this.lensGeometry, this.lensMaterial);
    this.lensMesh.name = 'scopeLensDisplay';
    this.lensMesh.frustumCulled = false;
    this.lensMesh.renderOrder = 3;
    this.lensMesh.castShadow = false;
    this.lensMesh.receiveShadow = false;
    this.lensMesh.visible = false;

    // Edge-to-edge neon cyan cross on the glass (sniper reticle).
    this.reticleMaterial = new THREE.MeshBasicMaterial({
      color: SCOPE_RETICLE_COLOR,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.reticleHGeometry = new THREE.PlaneGeometry(2, SCOPE_RETICLE_THICKNESS);
    this.reticleVGeometry = new THREE.PlaneGeometry(SCOPE_RETICLE_THICKNESS, 2);
    const hBar = new THREE.Mesh(this.reticleHGeometry, this.reticleMaterial);
    const vBar = new THREE.Mesh(this.reticleVGeometry, this.reticleMaterial);
    hBar.renderOrder = 4;
    vBar.renderOrder = 4;
    hBar.position.z = 0.003;
    vBar.position.z = 0.003;
    this.reticleRoot = new THREE.Group();
    this.reticleRoot.name = 'scopeLensReticle';
    this.reticleRoot.add(hBar, vBar);
    this.lensMesh.add(this.reticleRoot);
  }

  get isBound(): boolean {
    return this.decal != null;
  }

  /**
   * Bind to the optic's `scope_camera_decal` (position reference only).
   * `hideRoot` is hidden while baking the lens feed (FP camera / viewmodel).
   */
  bind(weaponRoot: THREE.Object3D, hideRoot: THREE.Object3D | null): boolean {
    if (this.boundWeapon === weaponRoot && this.decal) {
      this.hideRoot = hideRoot;
      return true;
    }

    this.unbind();

    const decal = findNamedMesh(weaponRoot, SCOPE_CAMERA_DECAL_NAME);
    if (!decal) return false;

    this.boundWeapon = weaponRoot;
    this.decal = decal;
    this.hideRoot = hideRoot;
    this.previousMaterial = decal.material;

    // Authored decal is only a socket — hide its warped mesh UVs.
    decal.visible = false;

    weaponRoot.updateMatrixWorld(true);
    _box.setFromObject(decal);
    _box.getSize(_decalSize);
    // Disc radius ≈ half the largest authored glass extent (world units).
    this.lensRadius = Math.max(_decalSize.x, _decalSize.y, _decalSize.z, 0.008) * 0.52;
    this.lensMesh.visible = true;
    return true;
  }

  unbind(): void {
    if (this.decal && this.previousMaterial) {
      this.decal.material = this.previousMaterial;
      this.decal.visible = true;
    }
    this.lensMesh.removeFromParent();
    this.lensMesh.visible = false;
    this.decal = null;
    this.previousMaterial = null;
    this.boundWeapon = null;
    this.hideRoot = null;
    this.adsBlend = 0;
  }

  setZoom(adsBlend: number, adsFov: number): void {
    this.adsBlend = THREE.MathUtils.clamp(adsBlend, 0, 1);
    this.adsFov = adsFov;
  }

  /**
   * Bake the zoomed feed and sync the display circle to the decal / camera.
   * Call before the main scene render.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    mainCamera: THREE.PerspectiveCamera,
  ): void {
    if (!this.decal) return;

    // World-space under the scene so the glass tracks the optic socket.
    if (this.lensMesh.parent !== scene) {
      scene.add(this.lensMesh);
    }
    this.syncLensTransform(mainCamera);

    if (this.adsBlend < ADS_BLEND_SHOW) {
      this.lensMaterial.color.setHex(0x050505);
      this.lensMaterial.map = null;
      this.lensMaterial.needsUpdate = true;
      this.reticleRoot.visible = false;
      return;
    }

    this.reticleRoot.visible = true;
    this.lensMaterial.color.setHex(0xffffff);
    if (this.lensMaterial.map !== this.renderTarget.texture) {
      this.lensMaterial.map = this.renderTarget.texture;
      this.lensMaterial.needsUpdate = true;
    }

    // Exact main-camera pose → RT center == crosshair aim ray.
    mainCamera.updateMatrixWorld(true);
    mainCamera.getWorldPosition(_camPos);
    mainCamera.getWorldQuaternion(_camQuat);
    this.scopeCamera.position.copy(_camPos);
    this.scopeCamera.quaternion.copy(_camQuat);
    this.scopeCamera.up.copy(mainCamera.up);
    // Extra magnification on the glass vs the already-zoomed main ADS FOV.
    const zoomFov = Math.min(
      this.adsFov * SCOPE_PIP_FOV_SCALE,
      mainCamera.fov * SCOPE_PIP_FOV_SCALE,
    );
    this.scopeCamera.fov = THREE.MathUtils.lerp(mainCamera.fov, zoomFov, this.adsBlend);
    // Same aspect as the main camera so world proportions match the hip view.
    this.scopeCamera.aspect = mainCamera.aspect;
    this.scopeCamera.near = mainCamera.near;
    this.scopeCamera.far = mainCamera.far;
    this.scopeCamera.updateProjectionMatrix();

    const aspect = Math.max(mainCamera.aspect, 0.1);
    const rtW = Math.max(1, Math.round(RT_HEIGHT * aspect));
    if (this.renderTarget.width !== rtW || this.renderTarget.height !== RT_HEIGHT) {
      this.renderTarget.setSize(rtW, RT_HEIGHT);
    }

    // Circle UVs are 1:1 — map only the center square of the widescreen RT so
    // nothing is stretched/squashed on the round glass.
    const map = this.renderTarget.texture;
    if (aspect >= 1) {
      const uSpan = 1 / aspect;
      map.repeat.set(uSpan, 1);
      map.offset.set((1 - uSpan) * 0.5, 0);
    } else {
      const vSpan = aspect;
      map.repeat.set(1, vSpan);
      map.offset.set(0, (1 - vSpan) * 0.5);
    }
    map.needsUpdate = true;

    const hideRoot = this.hideRoot;
    const wasVisible = hideRoot?.visible ?? true;
    if (hideRoot) hideRoot.visible = false;
    const lensWasVisible = this.lensMesh.visible;
    this.lensMesh.visible = false;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.setRenderTarget(this.renderTarget);
    renderer.autoClear = true;
    renderer.clear();
    renderer.render(scene, this.scopeCamera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    this.lensMesh.visible = lensWasVisible;
    if (hideRoot) hideRoot.visible = wasVisible;
  }

  dispose(): void {
    this.unbind();
    this.renderTarget.dispose();
    this.lensMaterial.dispose();
    this.reticleMaterial.dispose();
    this.lensGeometry.dispose();
    this.reticleHGeometry.dispose();
    this.reticleVGeometry.dispose();
  }

  /** Place a camera-facing circle on the authored glass socket (world space). */
  private syncLensTransform(mainCamera: THREE.PerspectiveCamera): void {
    if (!this.decal) return;

    this.decal.updateMatrixWorld(true);
    mainCamera.updateMatrixWorld(true);

    this.decal.getWorldPosition(_decalPos);
    mainCamera.getWorldQuaternion(_camQuat);

    // Align with the camera (CircleGeometry +Z == camera +Z, facing the player).
    this.lensMesh.position.copy(_decalPos);
    this.lensMesh.quaternion.copy(_camQuat);
    this.lensMesh.scale.setScalar(this.lensRadius);
    this.lensMesh.visible = true;
  }
}

function findNamedMesh(root: THREE.Object3D, name: string): THREE.Mesh | null {
  const lower = name.toLowerCase();
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh) || !child.name) return;
    if (child.name.toLowerCase() === lower) found = child;
  });
  return found;
}
