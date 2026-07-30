import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PartyMember } from '../../shared/network/party';
import { isPickableWeaponId, type WeaponId } from '../../shared/content/weaponIds';
import { getActiveCharacterId, getCharacterMeshFile } from '../content/activeCharacterMesh';
import { getActiveOperatorId, setActiveOperatorId } from '../content/activeOperatorCharacter';
import { resolveFaceIdForCharacter } from '../content/characterFaces';
import {
  createCharacterInstance,
  loadLobbyIdleCharacterTemplate,
  loadLobbyIdleCharacterTemplateForMesh,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
} from '../player/characterModel';
import { applyCharacterFace } from '../player/characterFace';
import { remoteWeaponMeshScale } from '../combat/WeaponLoadout';
import { createWeaponMesh, preloadWeaponMeshes } from '../content/weaponMeshes';
import { getRemoteWeaponMount } from '../player/remoteWeaponMount';
import { createLobbySkyboxTexture } from '../world/SkyboxBuilder';
import { updateEdgeLinesForCamera, updateLineResolution } from '../visuals/edgeLines';
import { GrassField } from '../world/GrassField';
import {
  getGraphicsQualitySummary,
  resolveGraphicsQuality,
} from '../render/graphicsQuality';
import { LobbyMap, type LandmarkFrameSide } from '../world/LobbyMap';
import { preloadDroneModel } from '../content/droneModel';
import { createDroneVisual } from '../world/DroneField';
import { LobbyPerfHud } from '../ui/LobbyPerfHud';
import { LobbyPartyAvatar, partyMemberOffsets } from './LobbyPartyAvatar';
import { fetchDefaultPrimaryWeaponId } from './lobbyLoadoutWeapon';
import { bindTextureQualityRenderer } from '../content/textureQuality';

/** Soft warm key — matches lobby dawn sky / reference lighting. */
const LOBBY_SUN_DIR = new THREE.Vector3(4.5, 2.2, 3.5);

const BASE_CAMERA_Y = 1.55;
const BASE_CAMERA_Z = 5.15;
const CAMERA_LOOK_Y = 1.15;
const CAMERA_ZOOM_PER_MEMBER = 0.22;
const CAMERA_HOME_FOV = 42;
const CAMERA_LANDMARK_FOV = 30;
const FALLBACK_LOBBY_WEAPON: WeaponId = 'plasma_rifle';

interface LobbyCameraDrive {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  toLook: THREE.Vector3;
  fromFov: number;
  toFov: number;
  duration: number;
  elapsed: number;
  /** `true` when the tween finished; `false` when interrupted. */
  resolve: (completed: boolean) => void;
}

/** Decorative lobby drones — visual only, orbit near background rocks. */
const LOBBY_DRONE_COUNT = 5;
const LOBBY_DRONE_SCALE = 0.42;
/** ~25% farther from camera than the old near-avatar orbit. */
const LOBBY_DRONE_DEPTH_SCALE = 1.25;

interface LobbyDroneActor {
  readonly root: THREE.Group;
  readonly phase: number;
  readonly speed: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly height: number;
  readonly bob: number;
  readonly bobSpeed: number;
}

export class LobbyScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly avatar = new THREE.Group();
  private readonly bodyRoot = new THREE.Group();
  private characterInstance: CharacterInstance | null = null;
  private handRig: THREE.Group | null = null;
  private weaponMesh: THREE.Group | null = null;
  private equippedWeaponId: WeaponId | null = null;
  private grassField: GrassField | null = null;
  private readonly lobbyMap: LobbyMap;
  /** Local + party feet pose (top of center platform when map is ready). */
  private standPose = { x: 0, y: 0, z: 0 };
  private readonly droneFlockRoot = new THREE.Group();
  private readonly drones: LobbyDroneActor[] = [];
  private readonly clock = new THREE.Clock();
  private readonly performanceHud = new LobbyPerfHud();
  private readonly localUserId: string;
  private readonly remoteAvatars = new Map<string, LobbyPartyAvatar>();
  private partyMembers: PartyMember[] = [];
  /** Cache key `${characterId}::${primaryWeaponId}` per remote user. */
  private readonly remoteAvatarLookKeys = new Map<string, string>();
  private remoteAvatarLoadToken = 0;
  private animationId = 0;
  private active = true;
  private avatarLoadToken = 0;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  /** `followStand` = party-framed lobby cam; `hold` = stay on last fly-to pose. */
  private cameraMode: 'followStand' | 'hold' = 'followStand';
  private cameraDrive: LobbyCameraDrive | null = null;
  private readonly cameraLookScratch = new THREE.Vector3();
  private readonly cameraHoldLookAt = new THREE.Vector3();

  constructor(container: HTMLElement, localUserId: string) {
    this.localUserId = localUserId;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      220,
    );
    this.camera.position.set(0, BASE_CAMERA_Y, BASE_CAMERA_Z);
    this.camera.lookAt(0, CAMERA_LOOK_Y, 0);

    const quality = resolveGraphicsQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: quality.antialias });
    bindTextureQualityRenderer(this.renderer);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality.lobbyMaxPixelRatio),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    console.info(`[Graphics] lobby ${getGraphicsQualitySummary()}`);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    this.scene.background = createLobbySkyboxTexture();
    // Soft purple atmospheric haze over distant canyon ridges.
    this.scene.fog = new THREE.Fog(0xb8a8c8, 28, 145);

    // Soft dawn lighting: cool lavender fill + warm golden key (reference look).
    const hemi = new THREE.HemisphereLight(0xd4c8e8, 0x6a5a58, 1.05);
    const key = new THREE.DirectionalLight(0xffe0b8, 1.25);
    key.position.copy(LOBBY_SUN_DIR);
    const fill = new THREE.DirectionalLight(0xc8b8e0, 0.45);
    fill.position.set(-3, 2.5, -2);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.35);
    rim.position.set(1.5, 1.2, -3);
    this.scene.add(hemi, key, fill, rim);

    this.lobbyMap = new LobbyMap();
    this.scene.add(this.lobbyMap.group);
    void this.lobbyMap.whenReady.then(() => {
      if (!this.active) return;
      this.applyCenterPlatformStand();
      this.mountLobbyGrass();
    });

    this.scene.add(this.droneFlockRoot);
    void this.mountLobbyDrones();

    this.bodyRoot.rotation.y = Math.PI * 1.12;
    this.avatar.add(this.bodyRoot);
    this.scene.add(this.avatar);

    void this.bootstrapAvatar();

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.loop();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      this.loop();
    } else {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  /** True once a landmark fly has finished (camera held on the focus pose). */
  isLandmarkFocused(): boolean {
    return this.cameraMode === 'hold' && !this.cameraDrive;
  }

  /**
   * Fly the lobby camera toward a named map landmark (e.g. `tower_control`).
   * Keeps the final pose until {@link flyToLobbyHome}.
   * @returns `true` if the fly completed; `false` if interrupted / landmark missing.
   */
  async flyToLandmark(
    objectName: string,
    options: { durationSec?: number; frameSide?: LandmarkFrameSide } = {},
  ): Promise<boolean> {
    const durationSec = options.durationSec ?? 0.55;
    const frameSide = options.frameSide ?? 'left';
    const focus = this.lobbyMap.getLandmarkFocusPose(objectName, frameSide);
    if (!focus) {
      console.warn(`[LobbyScene] Landmark not found for camera fly-to: ${objectName}`);
      return false;
    }
    const completed = await this.beginCameraDrive(
      focus.position.clone(),
      focus.lookAt.clone(),
      CAMERA_LANDMARK_FOV,
      durationSec,
    );
    if (!completed) return false;
    this.cameraMode = 'hold';
    this.cameraHoldLookAt.copy(focus.lookAt);
    return true;
  }

  /**
   * Return the camera to the default party stand framing.
   * @returns `true` if the fly completed (or already home).
   */
  async flyToLobbyHome(durationSec = 0.5): Promise<boolean> {
    // Always drive (or snap) back to the stand framing — including when HOME is
    // pressed while already "home", so any mid-flight pose is corrected.
    if (this.cameraMode === 'followStand' && !this.cameraDrive) {
      this.cameraMode = 'followStand';
      this.updateCamera(Math.max(1, this.partyMembers.length));
      return true;
    }

    const home = this.getStandCameraPose();
    const completed = await this.beginCameraDrive(
      home.position,
      home.lookAt,
      CAMERA_HOME_FOV,
      durationSec,
    );
    if (!completed) return false;
    this.cameraMode = 'followStand';
    this.updateCamera(Math.max(1, this.partyMembers.length));
    return true;
  }

  /** Re-read default loadout and swap idle pose + equipped primary. */
  async refreshFromDefaultLoadout(): Promise<void> {
    const weaponId = await fetchDefaultPrimaryWeaponId();
    if (weaponId === this.equippedWeaponId && this.characterInstance) return;
    await this.applyLobbyLoadout(weaponId);
  }

  /** Force remount using current default loadout + equipped character mesh. */
  async remountCharacter(): Promise<void> {
    const weaponId = await fetchDefaultPrimaryWeaponId();
    await this.applyLobbyLoadout(weaponId);
  }

  private async mountLobbyDrones(): Promise<void> {
    try {
      await preloadDroneModel();
      if (!this.active) return;

      this.droneFlockRoot.clear();
      this.drones.length = 0;

      // Staggered orbits pushed toward the canyon rocks (further from camera).
      const layouts = [
        { phase: 0.0, speed: 0.28, rx: 2.4, rz: 1.85, cx: -1.2, cz: -2.1, h: 2.35, bob: 0.32, bobSpeed: 0.8 },
        { phase: 1.3, speed: 0.22, rx: 3.1, rz: 2.2, cx: 1.6, cz: -2.6, h: 2.8, bob: 0.38, bobSpeed: 0.65 },
        { phase: 2.5, speed: 0.34, rx: 2.0, rz: 1.55, cx: 0.2, cz: -1.8, h: 1.95, bob: 0.26, bobSpeed: 0.95 },
        { phase: 3.8, speed: 0.26, rx: 2.7, rz: 2.0, cx: -2.4, cz: -3.0, h: 3.15, bob: 0.4, bobSpeed: 0.7 },
        { phase: 5.1, speed: 0.3, rx: 2.2, rz: 1.7, cx: 2.5, cz: -2.35, h: 2.55, bob: 0.3, bobSpeed: 0.88 },
      ] as const;

      for (let i = 0; i < LOBBY_DRONE_COUNT; i++) {
        const layout = layouts[i]!;
        const { root } = createDroneVisual();
        root.scale.setScalar(LOBBY_DRONE_SCALE * (0.92 + (i % 3) * 0.06));
        this.droneFlockRoot.add(root);
        this.drones.push({
          root,
          phase: layout.phase,
          speed: layout.speed,
          radiusX: layout.rx * LOBBY_DRONE_DEPTH_SCALE,
          radiusZ: layout.rz * LOBBY_DRONE_DEPTH_SCALE,
          centerX: layout.cx * LOBBY_DRONE_DEPTH_SCALE,
          centerZ: layout.cz * LOBBY_DRONE_DEPTH_SCALE,
          height: layout.h,
          bob: layout.bob,
          bobSpeed: layout.bobSpeed,
        });
      }
    } catch (error) {
      console.warn('[LobbyScene] Failed to load lobby drones', error);
    }
  }

  /** Snap local + party avatars onto the map's center platform top. */
  private applyCenterPlatformStand(): void {
    const stand = this.lobbyMap.getCenterPlatformStandPose();
    if (stand) {
      this.standPose = { x: stand.x, y: stand.y, z: stand.z };
    }
    this.avatar.position.set(this.standPose.x, this.standPose.y, this.standPose.z);
    this.syncRemoteAvatars();
    this.updateCamera(Math.max(1, this.partyMembers.length));
  }

  /** Spawn grass only on Floor gaps (no prop footprints / avatar pad). */
  private mountLobbyGrass(): void {
    if (this.grassField) {
      this.scene.remove(this.grassField.mesh);
      this.grassField.dispose();
      this.grassField = null;
    }

    const placement = this.lobbyMap.createFloorGrassPlacement({
      x: this.standPose.x,
      z: this.standPose.z,
    });
    const grass = resolveGraphicsQuality(this.renderer).lobbyGrass;
    this.grassField = new GrassField(() => 0, {
      halfExtent: placement?.halfExtent ?? 7.5,
      maxBlades: grass.maxBlades,
      gridStep: grass.gridStep,
      bladeSegments: grass.bladeSegments,
      bladeHeight: 0.2,
      bladeWidth: 0.028,
      extraBladeChance: grass.extraBladeChance,
      frustumCulled: grass.frustumCulled,
      skipPatches: false,
      seed: 0x10bb3,
      sunDirection: LOBBY_SUN_DIR.clone(),
      canPlace: placement?.canPlace,
      shortBladeChance: 0.5,
      shortBladeScale: 0.5,
    });
    this.scene.add(this.grassField.mesh);
  }

  private async bootstrapAvatar(): Promise<void> {
    try {
      await preloadWeaponMeshes();
      const weaponId = await fetchDefaultPrimaryWeaponId();
      await this.applyLobbyLoadout(weaponId);
    } catch (error) {
      console.warn('[LobbyScene] Failed to load lobby avatar', error);
      try {
        await this.applyLobbyLoadout(FALLBACK_LOBBY_WEAPON);
      } catch (fallbackError) {
        console.warn('[LobbyScene] Fallback lobby avatar failed', fallbackError);
      }
    } finally {
      this.scheduleReadyAfterRender();
    }
  }

  private async applyLobbyLoadout(weaponId: WeaponId): Promise<void> {
    const token = ++this.avatarLoadToken;
    const characterId = getActiveCharacterId();
    const template = await loadLobbyIdleCharacterTemplate(
      weaponId,
      getCharacterMeshFile(characterId),
      characterId,
    );
    if (token !== this.avatarLoadToken) return;

    this.clearLocalCharacter();
    const operatorId = getActiveOperatorId();
    this.characterInstance = createCharacterInstance(template, {
      characterId,
      operatorId,
      applyFace: false,
    });
    this.bodyRoot.add(this.characterInstance.root);
    // Await so the head is on before the first lobby frame / weapon attach.
    await applyCharacterFace(
      this.characterInstance.root,
      resolveFaceIdForCharacter(operatorId),
    );
    if (token !== this.avatarLoadToken) return;
    this.attachLobbyWeapon(template, weaponId);
    this.equippedWeaponId = weaponId;
    this.rebuildRemoteAvatars();
  }

  private clearLocalCharacter(): void {
    this.clearLobbyWeapon();
    this.characterInstance?.dispose();
    this.characterInstance = null;
    while (this.bodyRoot.children.length > 0) {
      this.bodyRoot.remove(this.bodyRoot.children[0]!);
    }
  }

  private clearLobbyWeapon(): void {
    this.weaponMesh?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const { material } = child;
        if (Array.isArray(material)) {
          for (const entry of material) entry.dispose();
        } else {
          material.dispose();
        }
      }
    });
    this.weaponMesh?.removeFromParent();
    this.weaponMesh = null;
    this.handRig?.removeFromParent();
    this.handRig = null;
  }

  private scheduleReadyAfterRender(): void {
    requestAnimationFrame(() => {
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
      requestAnimationFrame(() => {
        this.resolveReady();
      });
    });
  }

  setPartyMembers(members: PartyMember[]): void {
    this.partyMembers = members;
    const self = members.find((member) => member.userId === this.localUserId);
    const prevOperator = getActiveOperatorId();
    if (self?.selectedOperatorId) {
      setActiveOperatorId(self.selectedOperatorId);
    }
    this.updateCamera(members.length);
    this.syncRemoteAvatars();
    if (self?.selectedOperatorId && self.selectedOperatorId !== prevOperator) {
      void this.remountCharacter();
    }
  }

  private rebuildRemoteAvatars(): void {
    for (const avatar of this.remoteAvatars.values()) {
      avatar.dispose();
    }
    this.remoteAvatars.clear();
    this.remoteAvatarLookKeys.clear();
    this.syncRemoteAvatars();
  }

  private resolveMemberPrimaryWeapon(member: PartyMember): WeaponId {
    const raw = member.primaryWeaponId?.trim() ?? '';
    if (isPickableWeaponId(raw)) return raw;
    return this.equippedWeaponId ?? FALLBACK_LOBBY_WEAPON;
  }

  private remoteLookKey(member: PartyMember): string {
    const characterId = member.selectedCharacterId || 'basic';
    const operatorId = member.selectedOperatorId || 'garla';
    return `${characterId}::${operatorId}::${this.resolveMemberPrimaryWeapon(member)}`;
  }

  private syncRemoteAvatars(): void {
    const remoteMembers = this.partyMembers.filter(
      (member) => member.userId !== this.localUserId,
    );
    const remoteIds = new Set(remoteMembers.map((member) => member.userId));

    for (const [userId, avatar] of this.remoteAvatars) {
      if (!remoteIds.has(userId)) {
        avatar.dispose();
        this.remoteAvatars.delete(userId);
        this.remoteAvatarLookKeys.delete(userId);
      }
    }

    const offsets = partyMemberOffsets(remoteMembers.length);
    const loadToken = ++this.remoteAvatarLoadToken;
    remoteMembers.forEach((member, index) => {
      const lookKey = this.remoteLookKey(member);
      const existing = this.remoteAvatars.get(member.userId);
      const offsetX = offsets[index] ?? 0;
      if (existing && this.remoteAvatarLookKeys.get(member.userId) === lookKey) {
        existing.setPosition(
          this.standPose.x + offsetX,
          this.standPose.y,
          this.standPose.z,
        );
        return;
      }

      if (existing) {
        existing.dispose();
        this.remoteAvatars.delete(member.userId);
        this.remoteAvatarLookKeys.delete(member.userId);
      }

      void this.spawnRemoteAvatar(member, offsetX, loadToken);
    });

    this.avatar.position.set(this.standPose.x, this.standPose.y, this.standPose.z);
  }

  private async spawnRemoteAvatar(
    member: PartyMember,
    positionX: number,
    loadToken: number,
  ): Promise<void> {
    const characterId = member.selectedCharacterId || 'basic';
    const operatorId = member.selectedOperatorId || 'garla';
    const weaponId = this.resolveMemberPrimaryWeapon(member);
    const lookKey = `${characterId}::${operatorId}::${weaponId}`;

    try {
      const meshFile = getCharacterMeshFile(characterId);
      const template = await loadLobbyIdleCharacterTemplateForMesh(
        meshFile,
        weaponId,
        characterId,
      );
      if (loadToken !== this.remoteAvatarLoadToken) return;
      if (!this.partyMembers.some((entry) => entry.userId === member.userId)) return;

      const previous = this.remoteAvatars.get(member.userId);
      previous?.dispose();

      const avatar = new LobbyPartyAvatar(
        member.username,
        template,
        weaponId,
        characterId,
        operatorId,
      );
      avatar.setPosition(
        this.standPose.x + positionX,
        this.standPose.y,
        this.standPose.z,
      );
      this.scene.add(avatar.root);
      this.remoteAvatars.set(member.userId, avatar);
      this.remoteAvatarLookKeys.set(member.userId, lookKey);
    } catch (error) {
      console.warn('[LobbyScene] Failed to load party avatar', member.userId, error);
    }
  }

  private getStandCameraPose(): {
    position: THREE.Vector3;
    lookAt: THREE.Vector3;
  } {
    const memberCount = Math.max(1, this.partyMembers.length);
    const zoom = 1 + CAMERA_ZOOM_PER_MEMBER * Math.max(0, memberCount - 1);
    return {
      position: new THREE.Vector3(
        this.standPose.x,
        this.standPose.y + BASE_CAMERA_Y,
        this.standPose.z + BASE_CAMERA_Z * zoom,
      ),
      lookAt: new THREE.Vector3(
        this.standPose.x,
        this.standPose.y + CAMERA_LOOK_Y,
        this.standPose.z,
      ),
    };
  }

  private updateCamera(memberCount: number): void {
    if (this.cameraDrive || this.cameraMode === 'hold') return;

    const zoom = 1 + CAMERA_ZOOM_PER_MEMBER * Math.max(0, memberCount - 1);
    this.camera.fov = CAMERA_HOME_FOV;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.standPose.x,
      this.standPose.y + BASE_CAMERA_Y,
      this.standPose.z + BASE_CAMERA_Z * zoom,
    );
    this.camera.lookAt(
      this.standPose.x,
      this.standPose.y + CAMERA_LOOK_Y,
      this.standPose.z,
    );
  }

  private beginCameraDrive(
    toPos: THREE.Vector3,
    toLook: THREE.Vector3,
    toFov: number,
    durationSec: number,
  ): Promise<boolean> {
    if (this.cameraDrive) {
      this.cameraDrive.resolve(false);
      this.cameraDrive = null;
    }

    this.camera.getWorldDirection(this.cameraLookScratch);
    const fromLook = this.camera.position
      .clone()
      .addScaledVector(this.cameraLookScratch, 4);

    return new Promise((resolve) => {
      this.cameraDrive = {
        fromPos: this.camera.position.clone(),
        toPos,
        fromLook,
        toLook,
        fromFov: this.camera.fov,
        toFov,
        duration: Math.max(0.05, durationSec),
        elapsed: 0,
        resolve,
      };
    });
  }

  private tickCameraDrive(delta: number): void {
    const drive = this.cameraDrive;
    if (!drive) return;

    drive.elapsed += delta;
    const u = Math.min(1, drive.elapsed / drive.duration);
    // Smoothstep — soft ease in/out for a cinematic fly.
    const t = u * u * (3 - 2 * u);

    this.camera.position.lerpVectors(drive.fromPos, drive.toPos, t);
    this.cameraLookScratch.lerpVectors(drive.fromLook, drive.toLook, t);
    this.camera.lookAt(this.cameraLookScratch);
    this.camera.fov = drive.fromFov + (drive.toFov - drive.fromFov) * t;
    this.camera.updateProjectionMatrix();

    if (u >= 1) {
      this.camera.position.copy(drive.toPos);
      this.camera.lookAt(drive.toLook);
      this.camera.fov = drive.toFov;
      this.camera.updateProjectionMatrix();
      this.cameraDrive = null;
      drive.resolve(true);
    }
  }

  private updateDrones(t: number): void {
    const baseX = this.standPose.x;
    const baseY = this.standPose.y;
    const baseZ = this.standPose.z;

    for (const drone of this.drones) {
      const angle = t * drone.speed + drone.phase;
      const bob = Math.sin(t * drone.bobSpeed + drone.phase) * drone.bob;
      drone.root.position.set(
        baseX + drone.centerX + Math.cos(angle) * drone.radiusX,
        baseY + drone.height + bob,
        baseZ + drone.centerZ + Math.sin(angle) * drone.radiusZ,
      );
      drone.root.rotation.set(0, 0, 0);
    }
  }

  private loop = (): void => {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const t = this.clock.getElapsedTime();

    this.tickCameraDrive(delta);
    this.updateDrones(t);
    this.characterInstance?.update(delta);

    for (const avatar of this.remoteAvatars.values()) {
      avatar.update(delta);
    }

    this.grassField?.update(t, { cameraPos: this.camera.position });

    updateEdgeLinesForCamera(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.performanceHud.update(delta);
  };

  private attachLobbyWeapon(template: CharacterTemplate, weaponId: WeaponId): void {
    if (!this.characterInstance) return;

    const rig = resolveCharacterRig(this.characterInstance.root, template.bones);
    if (!rig) {
      console.warn('[LobbyScene] Character hand bone not found');
      return;
    }

    const mount = getRemoteWeaponMount(template.modelFile, weaponId);
    const handRig = new THREE.Group();
    handRig.name = 'lobbyHandRig';
    handRig.position.copy(mount.handPosition);
    handRig.rotation.copy(mount.handRotation);
    rig.rightHand.add(handRig);
    this.handRig = handRig;

    const weapon = createWeaponMesh(weaponId);
    weapon.scale.setScalar(remoteWeaponMeshScale(template.fitScale, weaponId));
    weapon.position.copy(mount.weaponPosition);
    weapon.rotation.copy(mount.weaponRotation);
    weapon.frustumCulled = false;
    handRig.add(weapon);
    this.weaponMesh = weapon;
  }

  private onResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        resolveGraphicsQuality(this.renderer).lobbyMaxPixelRatio,
      ),
    );
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    updateLineResolution(w, h);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    for (const avatar of this.remoteAvatars.values()) {
      avatar.dispose();
    }
    this.remoteAvatars.clear();
    this.remoteAvatarLookKeys.clear();
    this.clearLocalCharacter();
    this.equippedWeaponId = null;
    this.grassField?.dispose();
    this.grassField = null;
    this.labelRenderer.domElement.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
