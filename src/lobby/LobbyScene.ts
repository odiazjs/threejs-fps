import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PartyMember } from '../../shared/network/party';
import { isPickableWeaponId, MELEE_WEAPON_ID, type WeaponId } from '../../shared/content/weaponIds';
import { getCharacterMeshFile } from '../content/activeCharacterMesh';
import {
  createCharacterInstance,
  loadGameIdleCharacterTemplate,
  loadGameIdleCharacterTemplateForMesh,
  loadLobbyShootCharacterTemplate,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
} from '../player/characterModel';
import {
  readWeaponMuzzleWorldPosition,
  readWeaponSideVentFlashOffsets,
} from '../combat/aiming';
import { readPelletDirection } from '../combat/pelletSpread';
import { prewarmHitSplashesGpu } from '../combat/hitSplashPool';
import { ProjectileManager } from '../combat/ProjectileManager';
import { PROJECTILE_SPAWN_OFFSET } from '../combat/projectileConfig';
import { remoteWeaponMeshScale } from '../combat/WeaponLoadout';
import { collectWeaponSoundUrls, WeaponSoundService } from '../audio/WeaponSoundService';
import { getWeaponConfig } from '../content/weaponConfig';
import { createWeaponMesh, preloadWeaponMeshes } from '../content/weaponMeshes';
import { initFxLightPool } from '../effects/FxLightPool';
import { getRemoteWeaponMount } from '../player/remoteWeaponMount';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { addEdgeLines, updateEdgeLinesForCamera, updateLineResolution } from '../visuals/edgeLines';
import { GrassField } from '../world/GrassField';
import { createDroneVisual } from '../world/DroneField';
import { LobbyPerfHud } from '../ui/LobbyPerfHud';
import { LobbyPartyAvatar, partyMemberOffsets } from './LobbyPartyAvatar';
import { fetchDefaultPrimaryWeaponId } from './lobbyLoadoutWeapon';

const BASE_CAMERA_Z = 3.84;
const CAMERA_ZOOM_PER_MEMBER = 0.2;
const FALLBACK_LOBBY_WEAPON: WeaponId = 'plasma_rifle';
/** Keep the shoot pose on screen after the last non-auto shot/burst. */
const DRONE_SHOOT_POSE_HOLD_SEC = 0.35;
const FALLBACK_FIRE_INTERVAL_SEC = 1 / 10;
const LOBBY_DRONE_COUNT = 5;
const LOBBY_DRONE_ORBIT_RADIUS_X = 1.85;
const LOBBY_DRONE_ORBIT_RADIUS_Z = 1.35;
const LOBBY_DRONE_ORBIT_CENTER_Z = -0.35;
const LOBBY_DRONE_HEIGHT = 2.05;
const LOBBY_DRONE_BOB = 0.28;
const LOBBY_DRONE_SCALE = 0.42;

interface LobbyDrone {
  root: THREE.Group;
  propellers: THREE.Group[];
  /** Evenly spaced orbit phase in radians. */
  phase: number;
}
/** Approx chest height when spine bone isn't ready yet. */
const LOBBY_AIM_ORIGIN_Y = 1.25;
const LOBBY_AIM_PITCH_MIN = -0.35;
const LOBBY_AIM_PITCH_MAX = 1.15;
/** Extra hand pitch on top of spine so the gun clearly tracks the drone. */
const LOBBY_HAND_AIM_PITCH_SCALE = 0.45;

export class LobbyScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly avatar = new THREE.Group();
  private readonly bodyRoot = new THREE.Group();
  private characterInstance: CharacterInstance | null = null;
  private handRig: THREE.Group | null = null;
  private spineBone: THREE.Object3D | null = null;
  private weaponMesh: THREE.Group | null = null;
  private equippedWeaponId: WeaponId | null = null;
  private aimPitch = 0;
  private readonly handRigBaseRotation = new THREE.Euler();
  private readonly spineAimOrigin = new THREE.Vector3();
  private readonly spinePitchAxis = new THREE.Vector3(1, 0, 0);
  private readonly spinePitchQuat = new THREE.Quaternion();
  private readonly grassField: GrassField;
  private readonly drones: LobbyDrone[] = [];
  private targetDrone: LobbyDrone | null = null;
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
  private shootingAtDrone = false;
  /** Auto weapons only — continuous fire while the pointer is held. */
  private autoHoldFiring = false;
  /** Remaining shots in an active burst (0 = not bursting). */
  private burstShotsRemaining = 0;
  private pointerHeld = false;
  private shootPoseHoldSec = 0;
  private pendingPoseHoldSec = DRONE_SHOOT_POSE_HOLD_SEC;
  private fireCooldownSec = 0;
  private readonly projectiles: ProjectileManager;
  private readonly weaponSounds = new WeaponSoundService();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly muzzleOrigin = new THREE.Vector3();
  private readonly hitRayOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3();
  private readonly pelletDirection = new THREE.Vector3();
  private readonly sideVentOffsets: THREE.Vector3[] = [];
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(container: HTMLElement, localUserId: string) {
    this.localUserId = localUserId;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 1.45, BASE_CAMERA_Z);
    this.camera.lookAt(0, 1.1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    this.scene.background = createSkyboxTexture();

    const hemi = new THREE.HemisphereLight(0xb8d4e8, 0x2a3038, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0x82dbdb, 0.55);
    rim.position.set(-2, 2, -2);
    this.scene.add(hemi, key, rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x48b440,
        metalness: 0.05,
        roughness: 0.92,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    addEdgeLines(floor);
    this.scene.add(floor);

    this.grassField = new GrassField(() => 0, {
      halfExtent: 3.2,
      maxBlades: 14_500,
      gridStep: 0.08,
      bladeHeight: 0.22,
      bladeWidth: 0.026,
      extraBladeChance: 0.78,
      skipPatches: false,
      seed: 0x10bb3,
      sunDirection: new THREE.Vector3(2.5, 4, 3),
    });
    this.scene.add(this.grassField.mesh);

    for (let i = 0; i < LOBBY_DRONE_COUNT; i++) {
      const visual = createDroneVisual();
      visual.root.scale.setScalar(LOBBY_DRONE_SCALE);
      visual.root.userData.lobbyDroneIndex = i;
      this.scene.add(visual.root);
      this.drones.push({
        root: visual.root,
        propellers: visual.propellers,
        phase: (i / LOBBY_DRONE_COUNT) * Math.PI * 2,
      });
    }

    this.projectiles = new ProjectileManager(this.scene);

    this.bodyRoot.rotation.y = Math.PI;
    this.avatar.add(this.bodyRoot);
    this.scene.add(this.avatar);

    void this.bootstrapAvatar();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
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

  /** Re-read default loadout and swap idle pose + equipped primary. */
  async refreshFromDefaultLoadout(): Promise<void> {
    if (this.shootingAtDrone) return;
    const weaponId = await fetchDefaultPrimaryWeaponId();
    if (weaponId === this.equippedWeaponId && this.characterInstance) return;
    await this.applyLobbyLoadout(weaponId);
  }

  /** Force remount using current default loadout + equipped character mesh. */
  async remountCharacter(): Promise<void> {
    if (this.shootingAtDrone) return;
    const weaponId = await fetchDefaultPrimaryWeaponId();
    await this.applyLobbyLoadout(weaponId);
  }

  private async bootstrapAvatar(): Promise<void> {
    try {
      await preloadWeaponMeshes();
      const weaponId = await fetchDefaultPrimaryWeaponId();
      await this.applyLobbyLoadout(weaponId);
      // Shoot pose FBX so the first drone click doesn't hitch on model load.
      await loadLobbyShootCharacterTemplate(weaponId);
    } catch (error) {
      console.warn('[LobbyScene] Failed to load lobby avatar', error);
      try {
        await this.applyLobbyLoadout(FALLBACK_LOBBY_WEAPON);
        await loadLobbyShootCharacterTemplate(FALLBACK_LOBBY_WEAPON);
      } catch (fallbackError) {
        console.warn('[LobbyScene] Fallback lobby avatar failed', fallbackError);
      }
    } finally {
      await this.prewarmCombatShaders();
      this.scheduleReadyAfterRender();
    }
  }

  /**
   * Compile muzzle / bolt / splash programs before the first drone shot.
   * Mirrors the match-load path: park pooled FX, compile, then hide them.
   */
  private async prewarmCombatShaders(): Promise<void> {
    try {
      // Lit programs key off visible light count — pool must exist before compile.
      initFxLightPool(this.scene);
      this.projectiles.prewarmGpuResources();
      await prewarmHitSplashesGpu(this.renderer, this.scene, this.camera);
      await this.renderer.compileAsync(this.scene, this.camera);
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      console.warn('[LobbyScene] Combat shader prewarm failed', error);
    } finally {
      this.projectiles.finishGpuPrewarm();
    }
  }

  private async applyLobbyLoadout(weaponId: WeaponId): Promise<void> {
    const token = ++this.avatarLoadToken;
    const template = await loadGameIdleCharacterTemplate(weaponId);
    if (token !== this.avatarLoadToken) return;

    this.clearLocalCharacter();
    this.characterInstance = createCharacterInstance(template);
    this.bodyRoot.add(this.characterInstance.root);
    this.attachLobbyWeapon(template, weaponId);
    this.equippedWeaponId = weaponId;
    this.preloadWeaponSounds(weaponId);
    this.rebuildRemoteAvatars();
  }

  private preloadWeaponSounds(weaponId: WeaponId): void {
    const config = getWeaponConfig(weaponId);
    if (!config) return;
    void this.weaponSounds.preload(collectWeaponSoundUrls([config]));
  }

  private clearLocalCharacter(): void {
    this.clearLobbyWeapon();
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.spineBone = null;
    this.aimPitch = 0;
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
    this.spineBone = null;
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
    this.updateCamera(members.length);
    this.syncRemoteAvatars();
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
    return `${characterId}::${this.resolveMemberPrimaryWeapon(member)}`;
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
      if (existing && this.remoteAvatarLookKeys.get(member.userId) === lookKey) {
        existing.setPositionX(offsets[index] ?? 0);
        return;
      }

      if (existing) {
        existing.dispose();
        this.remoteAvatars.delete(member.userId);
        this.remoteAvatarLookKeys.delete(member.userId);
      }

      void this.spawnRemoteAvatar(member, offsets[index] ?? 0, index * 1.7, loadToken);
    });

    this.avatar.position.x = 0;
  }

  private async spawnRemoteAvatar(
    member: PartyMember,
    positionX: number,
    spinPhase: number,
    loadToken: number,
  ): Promise<void> {
    const characterId = member.selectedCharacterId || 'basic';
    const weaponId = this.resolveMemberPrimaryWeapon(member);
    const lookKey = `${characterId}::${weaponId}`;

    try {
      const meshFile = getCharacterMeshFile(characterId);
      const template = await loadGameIdleCharacterTemplateForMesh(meshFile, weaponId);
      if (loadToken !== this.remoteAvatarLoadToken) return;
      if (!this.partyMembers.some((entry) => entry.userId === member.userId)) return;

      const previous = this.remoteAvatars.get(member.userId);
      previous?.dispose();

      const avatar = new LobbyPartyAvatar(member.username, template, weaponId, spinPhase);
      avatar.setPositionX(positionX);
      this.scene.add(avatar.root);
      this.remoteAvatars.set(member.userId, avatar);
      this.remoteAvatarLookKeys.set(member.userId, lookKey);
    } catch (error) {
      console.warn('[LobbyScene] Failed to load party avatar', member.userId, error);
    }
  }

  private updateCamera(memberCount: number): void {
    const zoom = 1 + CAMERA_ZOOM_PER_MEMBER * Math.max(0, memberCount - 1);
    this.camera.position.z = BASE_CAMERA_Z * zoom;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.active) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hits = this.raycaster.intersectObjects(
      this.drones.map((drone) => drone.root),
      true,
    );
    if (hits.length === 0) return;

    const clicked = this.findDroneForObject(hits[0]!.object);
    if (!clicked) return;

    this.pointerHeld = true;
    try {
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Capture unsupported — window pointerup still ends hold-fire.
    }

    void this.beginShootAtDrone(clicked);
  };

  private onPointerUp = (): void => {
    if (!this.pointerHeld && !this.autoHoldFiring) return;
    this.pointerHeld = false;
    // Auto stops on release; burst finishes the current burst; semi is already done.
    if (this.autoHoldFiring) {
      this.autoHoldFiring = false;
      this.weaponSounds.stopAutoFire();
      this.shootPoseHoldSec = Math.max(this.shootPoseHoldSec, this.pendingPoseHoldSec);
    }
  };

  private findDroneForObject(object: THREE.Object3D): LobbyDrone | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const index = current.userData.lobbyDroneIndex;
      if (typeof index === 'number') {
        return this.drones[index] ?? null;
      }
      current = current.parent;
    }
    return null;
  }

  private fireIntervalFor(weaponId: WeaponId): number {
    const config = getWeaponConfig(weaponId);
    return config && config.fireRate > 0 ? 1 / config.fireRate : FALLBACK_FIRE_INTERVAL_SEC;
  }

  /** Semi/burst click while already in shoot pose — fire again as soon as weapon cooldown allows. */
  private tryClickFireWhileAiming(weaponId: WeaponId): void {
    const config = getWeaponConfig(weaponId);
    if (!config || config.fireMode === 'melee' || config.fireMode === 'auto') return;
    if (this.fireCooldownSec > 0) return;

    const fireInterval = this.fireIntervalFor(weaponId);

    if (config.fireMode === 'burst') {
      if (this.burstShotsRemaining > 0) return;
      this.burstShotsRemaining = Math.max(1, config.burstCount ?? 3);
      this.fireLobbyShot();
      this.burstShotsRemaining -= 1;
      this.fireCooldownSec = fireInterval;
      if (this.burstShotsRemaining === 0) {
        this.fireCooldownSec += Math.max(0, config.burstRecoverySec ?? 0);
        this.shootPoseHoldSec = this.pendingPoseHoldSec;
      }
      return;
    }

    // semi — one shot per click, limited only by weapon fireRate
    this.fireLobbyShot();
    this.fireCooldownSec = fireInterval;
    this.pointerHeld = false;
    this.shootPoseHoldSec = this.pendingPoseHoldSec;
  }

  private async beginShootAtDrone(drone: LobbyDrone): Promise<void> {
    const weaponId = this.equippedWeaponId;
    if (!weaponId || weaponId === MELEE_WEAPON_ID) return;

    this.weaponSounds.unlock();
    this.targetDrone = drone;

    // Already aiming/firing — retarget; non-auto can click-fire again immediately.
    if (this.shootingAtDrone) {
      if (this.autoHoldFiring) return;
      this.tryClickFireWhileAiming(weaponId);
      return;
    }

    const token = ++this.avatarLoadToken;
    this.shootingAtDrone = true;
    this.autoHoldFiring = false;
    this.burstShotsRemaining = 0;
    this.fireCooldownSec = 0;
    this.shootPoseHoldSec = 0;

    try {
      const template = await loadLobbyShootCharacterTemplate(weaponId);
      if (token !== this.avatarLoadToken || !this.shootingAtDrone) return;

      this.clearLocalCharacter();
      this.characterInstance = createCharacterInstance(template);
      this.bodyRoot.add(this.characterInstance.root);
      this.attachLobbyWeapon(template, weaponId);

      const config = getWeaponConfig(weaponId);
      if (!config || config.fireMode === 'melee') {
        this.endShootAtDrone();
        return;
      }

      this.pendingPoseHoldSec = this.resolveShootPoseHoldSec(template);
      const fireInterval = this.fireIntervalFor(weaponId);

      this.aimAvatarAtDrone();
      this.characterInstance.update(0);
      this.applyAimPose();

      if (config.fireMode === 'auto') {
        this.fireLobbyShot();
        if (this.pointerHeld) {
          this.autoHoldFiring = true;
          this.fireCooldownSec = fireInterval;
          this.startLobbyFireAudio(weaponId);
        } else {
          this.shootPoseHoldSec = this.pendingPoseHoldSec;
        }
      } else if (config.fireMode === 'burst') {
        // One trigger pull = one full burst (continues even if pointer releases).
        this.burstShotsRemaining = Math.max(1, config.burstCount ?? 3);
        this.fireLobbyShot();
        this.burstShotsRemaining -= 1;
        this.fireCooldownSec = fireInterval;
        if (this.burstShotsRemaining === 0) {
          this.fireCooldownSec += Math.max(0, config.burstRecoverySec ?? 0);
          this.shootPoseHoldSec = this.pendingPoseHoldSec;
        }
      } else {
        // semi — one shot per click
        this.fireLobbyShot();
        this.fireCooldownSec = fireInterval;
        this.pointerHeld = false;
        this.shootPoseHoldSec = this.pendingPoseHoldSec;
      }
    } catch (error) {
      console.warn('[LobbyScene] Failed to load shoot pose', error);
      this.shootingAtDrone = false;
      this.autoHoldFiring = false;
      this.burstShotsRemaining = 0;
      this.pointerHeld = false;
      this.shootPoseHoldSec = 0;
      this.targetDrone = null;
      this.weaponSounds.stopAutoFire();
      if (this.equippedWeaponId) {
        void this.applyLobbyLoadout(this.equippedWeaponId);
      }
    }
  }

  private resolveShootPoseHoldSec(template: CharacterTemplate): number {
    const clipSec = template.clipDurationSec;
    if (clipSec > 0.05) {
      return THREE.MathUtils.clamp(clipSec, DRONE_SHOOT_POSE_HOLD_SEC, 0.55);
    }
    return DRONE_SHOOT_POSE_HOLD_SEC;
  }

  private endShootAtDrone(): void {
    if (!this.shootingAtDrone) return;
    this.shootingAtDrone = false;
    this.autoHoldFiring = false;
    this.burstShotsRemaining = 0;
    this.pointerHeld = false;
    this.fireCooldownSec = 0;
    this.shootPoseHoldSec = 0;
    this.aimPitch = 0;
    this.targetDrone = null;
    this.weaponSounds.stopAutoFire();
    if (this.handRig) {
      this.handRig.rotation.copy(this.handRigBaseRotation);
    }
    const weaponId = this.equippedWeaponId;
    if (weaponId) {
      void this.applyLobbyLoadout(weaponId);
    }
  }

  private startLobbyFireAudio(weaponId: WeaponId): void {
    const config = getWeaponConfig(weaponId);
    if (!config?.sounds) return;
    if (config.fireMode === 'auto' && config.sounds.autoShot) {
      this.weaponSounds.startAutoFire(config.sounds);
    }
  }

  private aimAvatarAtDrone(): void {
    const target = this.targetDrone;
    if (!target) return;

    const feetX = this.avatar.position.x;
    const feetZ = this.avatar.position.z;
    const dxYaw = target.root.position.x - feetX;
    const dzYaw = target.root.position.z - feetZ;
    // bodyRoot is pre-rotated by π so visual forward matches atan2 toward target.
    this.avatar.rotation.y = Math.atan2(dxYaw, dzYaw);
    this.avatar.updateMatrixWorld(true);

    if (this.spineBone) {
      this.spineBone.getWorldPosition(this.spineAimOrigin);
    } else {
      this.spineAimOrigin.set(feetX, this.avatar.position.y + LOBBY_AIM_ORIGIN_Y, feetZ);
    }

    const dx = target.root.position.x - this.spineAimOrigin.x;
    const dy = target.root.position.y - this.spineAimOrigin.y;
    const dz = target.root.position.z - this.spineAimOrigin.z;
    const horizontal = Math.hypot(dx, dz);
    this.aimPitch = THREE.MathUtils.clamp(
      Math.atan2(dy, Math.max(horizontal, 1e-4)),
      LOBBY_AIM_PITCH_MIN,
      LOBBY_AIM_PITCH_MAX,
    );
  }

  /** Pitch spine + hand after the mixer so the gun tracks the drone. */
  private applyAimPose(): void {
    if (this.spineBone) {
      // Same convention as remote players: positive look-up → negative local X.
      this.spinePitchQuat.setFromAxisAngle(this.spinePitchAxis, -this.aimPitch);
      this.spineBone.quaternion.multiply(this.spinePitchQuat);
    }

    if (this.handRig) {
      this.handRig.rotation.set(
        this.handRigBaseRotation.x - this.aimPitch * LOBBY_HAND_AIM_PITCH_SCALE,
        this.handRigBaseRotation.y,
        this.handRigBaseRotation.z,
        this.handRigBaseRotation.order,
      );
    }
  }

  private updateDrones(t: number): void {
    const spin = t * 28;
    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i]!;
      const orbitAngle = t * 0.72 + drone.phase;
      const bobPhase = t * 1.25 + drone.phase * 0.7;
      drone.root.position.set(
        Math.cos(orbitAngle) * LOBBY_DRONE_ORBIT_RADIUS_X,
        LOBBY_DRONE_HEIGHT + Math.sin(bobPhase) * LOBBY_DRONE_BOB,
        LOBBY_DRONE_ORBIT_CENTER_Z + Math.sin(orbitAngle) * LOBBY_DRONE_ORBIT_RADIUS_Z,
      );
      drone.root.rotation.y = orbitAngle + Math.PI * 0.55;
      drone.root.rotation.z = Math.sin(orbitAngle * 1.4) * 0.14;

      for (let p = 0; p < drone.propellers.length; p++) {
        drone.propellers[p]!.rotation.y = spin * (p % 2 === 0 ? 1 : -1);
      }
    }
  }

  private fireLobbyShot(): void {
    const weaponId = this.equippedWeaponId;
    const weapon = this.weaponMesh;
    const target = this.targetDrone;
    if (!weaponId || !weapon || !target || weaponId === MELEE_WEAPON_ID) return;

    const config = getWeaponConfig(weaponId);
    if (!config || config.projectileSpeed <= 0) return;

    this.avatar.updateMatrixWorld(true);
    weapon.updateMatrixWorld(true);
    readWeaponMuzzleWorldPosition(weapon, this.muzzleOrigin);

    this.aimDirection.subVectors(target.root.position, this.muzzleOrigin);
    if (this.aimDirection.lengthSq() < 1e-8) return;
    this.aimDirection.normalize();

    this.hitRayOrigin
      .copy(this.muzzleOrigin)
      .addScaledVector(this.aimDirection, PROJECTILE_SPAWN_OFFSET);

    const hasSideVents = Boolean(config.muzzleFlash.sideVents);
    const sideVentCount = hasSideVents
      ? readWeaponSideVentFlashOffsets(
          weapon,
          this.muzzleOrigin,
          this.aimDirection,
          this.sideVentOffsets,
        )
      : 0;

    const pelletCount = Math.max(1, Math.round(config.pelletCount ?? 1));
    const spreadRad = config.pelletSpreadRad ?? 0;
    const ringPhase = Math.random() * Math.PI * 2;
    const isMultiPellet = pelletCount > 1;

    if (!(config.fireMode === 'auto' && config.sounds?.autoShot)) {
      this.weaponSounds.playSingleShot(config.sounds);
    }

    for (let pelletIndex = 0; pelletIndex < pelletCount; pelletIndex++) {
      readPelletDirection(
        this.aimDirection,
        pelletIndex,
        pelletCount,
        spreadRad,
        this.pelletDirection,
        isMultiPellet
          ? {
              ringPhase,
              radiusScale: 0.55 + Math.random() * 0.45,
              angleJitter: (Math.random() - 0.5) * 0.5,
            }
          : undefined,
      );

      const fireDir = isMultiPellet ? this.pelletDirection : this.aimDirection;
      this.raycaster.set(this.hitRayOrigin, fireDir);
      const droneHit = this.raycaster.intersectObject(target.root, true)[0];
      const forcedHitDistance =
        droneHit && droneHit.distance > 0.05 ? droneHit.distance : undefined;

      const pelletSpeed = isMultiPellet
        ? config.projectileSpeed * (0.85 + Math.random() * 0.3)
        : config.projectileSpeed;

      this.projectiles.spawn(
        {
          hitRayOrigin: this.hitRayOrigin,
          hitRayDirection: fireDir,
          visualOrigin: this.muzzleOrigin,
          speed: pelletSpeed,
        },
        {
          visualOnly: true,
          canHitPlayers: false,
          spawnBulletHoles: false,
          weaponId: config.id,
          forcedHitDistance,
          muzzleFlash: pelletIndex === 0 ? config.muzzleFlash : undefined,
          sideVentOffsets:
            pelletIndex === 0 && sideVentCount > 0 ? this.sideVentOffsets : undefined,
          boltColors: config.muzzleFlash?.colors,
          projectileStyle: config.projectileStyle,
          projectileGravity: config.projectileGravity,
          boltSizeScale: isMultiPellet ? 0.7 + Math.random() * 0.3 : undefined,
        },
      );
    }
  }

  private tickLobbyFire(delta: number): void {
    if (!this.weaponMesh || !this.equippedWeaponId) return;

    const config = getWeaponConfig(this.equippedWeaponId);
    if (!config) return;
    const interval =
      config.fireRate > 0 ? 1 / config.fireRate : FALLBACK_FIRE_INTERVAL_SEC;

    // Burst: finish the burst at fire-rate regardless of pointer hold.
    if (this.burstShotsRemaining > 0) {
      this.fireCooldownSec -= delta;
      while (this.fireCooldownSec <= 0 && this.burstShotsRemaining > 0) {
        this.fireLobbyShot();
        this.burstShotsRemaining -= 1;
        this.fireCooldownSec += interval;
        if (this.burstShotsRemaining === 0) {
          this.fireCooldownSec += Math.max(0, config.burstRecoverySec ?? 0);
          this.shootPoseHoldSec = this.pendingPoseHoldSec;
        }
      }
      return;
    }

    // Auto: keep firing only while the pointer stays down.
    if (!this.autoHoldFiring || !this.pointerHeld) return;

    this.fireCooldownSec -= delta;
    while (this.fireCooldownSec <= 0) {
      this.fireLobbyShot();
      this.fireCooldownSec += interval;
    }
  }

  private loop = (): void => {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const t = this.clock.getElapsedTime();

    this.updateDrones(t);

    if (this.shootingAtDrone) {
      this.aimAvatarAtDrone();
      // Weapon cooldown ticks even between semi clicks so spam-fire can resume ASAP.
      if (!this.autoHoldFiring && this.burstShotsRemaining <= 0) {
        this.fireCooldownSec = Math.max(0, this.fireCooldownSec - delta);
      }
      const waitingOnBurst = this.burstShotsRemaining > 0;
      if (!this.autoHoldFiring && !waitingOnBurst && this.shootPoseHoldSec > 0) {
        this.shootPoseHoldSec -= delta;
        if (this.shootPoseHoldSec <= 0) {
          this.endShootAtDrone();
        }
      }
    } else {
      this.avatar.rotation.y = Math.sin(t * 0.55) * 0.35;
      this.aimPitch = 0;
    }

    this.characterInstance?.update(delta);
    if (this.shootingAtDrone) {
      this.applyAimPose();
      this.tickLobbyFire(delta);
    }
    this.projectiles.update(delta);

    for (const avatar of this.remoteAvatars.values()) {
      avatar.update(delta, t);
    }

    this.grassField.update(t, { cameraPos: this.camera.position });

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
    this.handRigBaseRotation.copy(mount.handRotation);
    rig.rightHand.add(handRig);
    this.handRig = handRig;
    this.spineBone = rig.spine;

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
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    updateLineResolution(w, h);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    this.shootingAtDrone = false;
    this.autoHoldFiring = false;
    this.burstShotsRemaining = 0;
    this.pointerHeld = false;
    this.shootPoseHoldSec = 0;
    this.fireCooldownSec = 0;
    this.weaponSounds.stopAutoFire();
    for (const avatar of this.remoteAvatars.values()) {
      avatar.dispose();
    }
    this.remoteAvatars.clear();
    this.remoteAvatarLookKeys.clear();
    this.clearLocalCharacter();
    this.equippedWeaponId = null;
    this.grassField.dispose();
    this.labelRenderer.domElement.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
