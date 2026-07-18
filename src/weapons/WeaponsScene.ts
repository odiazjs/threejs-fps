import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WeaponId } from '../../shared/content/weaponIds';
import { createWeaponMesh, preloadWeaponMeshes } from '../content/weaponMeshes';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { disposeObject3D } from './disposeMesh';

const SHOWCASE_WEAPON_IDS: WeaponId[] = [
  'pistol',
  'plasma_rifle',
  'root_bio_carbine',
  'bio_liquid_rifle',
  'bio_machine_gun',
  'bio_smg_1',
  'plasma_shotgun',
  'sniper_rifle',
  'katana',
];
const SHOWCASE_TARGET_SIZE = 2.75;
const DEFAULT_CAMERA_Z = 4.2 * 1.25;
const DEFAULT_CAMERA_Y = 0.55;

export class WeaponsScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly weaponPivot = new THREE.Group();
  private readonly pickerButtons: HTMLButtonElement[];
  private readonly resizeObserver: ResizeObserver;
  private currentWeapon: THREE.Group | null = null;
  private currentWeaponId: WeaponId | null = null;
  private animationId = 0;
  private disposed = false;
  private resizeRetryId = 0;
  private lastSyncWidth = 0;
  private lastSyncHeight = 0;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private readyResolved = false;

  constructor(
    private readonly container: HTMLElement,
    pickerRoot: HTMLElement,
    private readonly onWeaponChange: (weaponId: WeaponId) => void = () => undefined,
  ) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 100);
    this.camera.position.set(0, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Drawing buffer only — CSS sizes the canvas to the stage (avoids first-open stretch).
    this.renderer.setSize(1, 1, false);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 9;
    this.controls.target.set(0, 0, 0);

    this.scene.background = createSkyboxTexture();

    const hemi = new THREE.HemisphereLight(0xb8d4e8, 0x2a3038, 1.05);
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(2.5, 4, 3);
    const fill = new THREE.DirectionalLight(0x82dbdb, 0.55);
    fill.position.set(-2.5, 1.5, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0, 2, -4);
    this.scene.add(hemi, key, fill, rim);

    const pedestal = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a2228,
        metalness: 0.35,
        roughness: 0.82,
      }),
    );
    pedestal.rotation.x = -Math.PI / 2;
    pedestal.position.y = -0.55 * 1.5;
    this.scene.add(pedestal);

    this.scene.add(this.weaponPivot);

    this.pickerButtons = [...pickerRoot.querySelectorAll<HTMLButtonElement>('.weapons-picker-btn')];
    for (const button of this.pickerButtons) {
      button.addEventListener('click', () => {
        const weaponId = button.dataset.weaponId;
        if (!weaponId) return;
        if (button.classList.contains('active') && weaponId === this.currentWeaponId) return;
        void this.selectWeapon(weaponId as WeaponId, button);
      });
    }

    // Tabs live beside the picker grid (sibling), not inside #weapons-picker.
    const categoryRoot = pickerRoot.parentElement ?? pickerRoot;
    const categoryTabs = [
      ...categoryRoot.querySelectorAll<HTMLButtonElement>('.armory-category-tab'),
    ];
    for (const tab of categoryTabs) {
      tab.addEventListener('click', () => {
        const category = tab.dataset.category ?? 'all';
        for (const entry of categoryTabs) {
          entry.classList.toggle('is-active', entry === tab);
        }
        for (const button of this.pickerButtons) {
          const match =
            category === 'all' || (button.dataset.category ?? '') === category;
          button.hidden = !match;
        }
      });
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.syncViewport();
    });
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.onResize);
    this.syncViewport();

    void preloadWeaponMeshes()
      .then(() => {
        // Weapon mesh is chosen by WeaponsView after loadouts resolve.
        this.scheduleReadyAfterRender();
      })
      .catch((error) => {
        console.warn('[WeaponsScene] Failed to load weapon models', error);
        this.scheduleReadyAfterRender();
      });

    this.loop();
  }

  getCurrentWeaponId(): WeaponId | null {
    return this.currentWeaponId;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Show a weapon in the preview (used by loadout primary/secondary clicks). */
  async showWeapon(weaponId: string): Promise<void> {
    if (!SHOWCASE_WEAPON_IDS.includes(weaponId as WeaponId)) return;
    if (weaponId === this.currentWeaponId) {
      this.syncPickerActive(weaponId as WeaponId);
      this.onWeaponChange(weaponId as WeaponId);
      return;
    }

    for (const entry of this.pickerButtons) {
      entry.disabled = true;
    }

    try {
      await preloadWeaponMeshes();
      this.mountWeapon(weaponId as WeaponId);
      this.syncPickerActive(weaponId as WeaponId);
      this.onWeaponChange(weaponId as WeaponId);
    } finally {
      for (const entry of this.pickerButtons) {
        entry.disabled = false;
      }
    }
  }

  private syncPickerActive(weaponId: WeaponId): void {
    for (const entry of this.pickerButtons) {
      const isActive = entry.dataset.weaponId === weaponId;
      entry.classList.toggle('active', isActive);
      entry.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
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

  /** Re-measure after the Armory loading veil lifts / layout settles. */
  refreshViewport(): void {
    this.syncViewport(true);
    requestAnimationFrame(() => {
      if (this.disposed) return;
      this.syncViewport(true);
    });
  }

  private async selectWeapon(weaponId: WeaponId, _button: HTMLButtonElement): Promise<void> {
    await this.showWeapon(weaponId);
  }

  private mountWeapon(weaponId: WeaponId): void {
    if (this.currentWeapon) {
      disposeObject3D(this.currentWeapon);
      this.currentWeapon = null;
    }

    const weapon = createWeaponMesh(weaponId);
    this.fitWeaponForShowcase(weapon);
    this.weaponPivot.add(weapon);
    this.currentWeapon = weapon;
    this.currentWeaponId = weaponId;
    this.resetOrbit();
  }

  private fitWeaponForShowcase(weapon: THREE.Group): void {
    weapon.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(weapon);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    weapon.scale.setScalar(SHOWCASE_TARGET_SIZE / maxDim);

    weapon.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(weapon);
    const center = fitted.getCenter(new THREE.Vector3());
    weapon.position.set(-center.x, -center.y, -center.z);
  }

  private resetOrbit(): void {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);
    this.controls.update();
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
      // Layout not ready yet (common on first Armory open) — retry next frame.
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.animationId);
    cancelAnimationFrame(this.resizeRetryId);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onResize);

    if (this.currentWeapon) {
      disposeObject3D(this.currentWeapon);
      this.currentWeapon = null;
    }

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
}
