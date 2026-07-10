import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PartyMember } from '../../shared/network/party';
import type { WeaponId } from '../../shared/content/weaponIds';
import {
  createCharacterInstance,
  loadGameIdleCharacterTemplate,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
} from '../player/characterModel';
import { remoteWeaponMeshScale } from '../combat/WeaponLoadout';
import { createWeaponMesh, preloadWeaponMeshes } from '../content/weaponMeshes';
import { getRemoteWeaponMount } from '../player/remoteWeaponMount';
import { createSkyboxTexture } from '../world/SkyboxBuilder';
import { addEdgeLines, updateEdgeLinesForCamera, updateLineResolution } from '../visuals/edgeLines';
import { GrassField } from '../world/GrassField';
import { createDroneVisual } from '../world/DroneField';
import { LobbyPerfHud } from '../ui/LobbyPerfHud';
import { LobbyPartyAvatar, partyMemberOffsets } from './LobbyPartyAvatar';
import { fetchDefaultPrimaryWeaponId } from './lobbyLoadoutWeapon';

const BASE_CAMERA_Z = 3.2;
const CAMERA_ZOOM_PER_MEMBER = 0.2;
const FALLBACK_LOBBY_WEAPON: WeaponId = 'plasma_rifle';

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
  private readonly grassField: GrassField;
  private readonly droneRoot: THREE.Group;
  private readonly dronePropellers: THREE.Group[];
  private readonly clock = new THREE.Clock();
  private readonly performanceHud = new LobbyPerfHud();
  private readonly localUserId: string;
  private readonly remoteAvatars = new Map<string, LobbyPartyAvatar>();
  private characterTemplate: CharacterTemplate | null = null;
  private partyMembers: PartyMember[] = [];
  private animationId = 0;
  private active = true;
  private avatarLoadToken = 0;
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

    const drone = createDroneVisual();
    this.droneRoot = drone.root;
    this.droneRoot.scale.setScalar(0.42);
    this.dronePropellers = drone.propellers;
    this.scene.add(this.droneRoot);

    this.bodyRoot.rotation.y = Math.PI;
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

  /** Re-read default loadout and swap idle pose + equipped primary. */
  async refreshFromDefaultLoadout(): Promise<void> {
    const weaponId = await fetchDefaultPrimaryWeaponId();
    if (weaponId === this.equippedWeaponId && this.characterInstance) return;
    await this.applyLobbyLoadout(weaponId);
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
    const template = await loadGameIdleCharacterTemplate(weaponId);
    if (token !== this.avatarLoadToken) return;

    this.clearLocalCharacter();
    this.characterTemplate = template;
    this.characterInstance = createCharacterInstance(template);
    this.bodyRoot.add(this.characterInstance.root);
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
    this.updateCamera(members.length);
    this.syncRemoteAvatars();
  }

  private rebuildRemoteAvatars(): void {
    for (const avatar of this.remoteAvatars.values()) {
      avatar.dispose();
    }
    this.remoteAvatars.clear();
    this.syncRemoteAvatars();
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
      }
    }

    if (!this.characterTemplate || !this.equippedWeaponId) return;

    const offsets = partyMemberOffsets(remoteMembers.length);
    remoteMembers.forEach((member, index) => {
      let avatar = this.remoteAvatars.get(member.userId);
      if (!avatar) {
        avatar = new LobbyPartyAvatar(
          member.username,
          this.characterTemplate!,
          this.equippedWeaponId!,
          index * 1.7,
        );
        this.scene.add(avatar.root);
        this.remoteAvatars.set(member.userId, avatar);
      }
      avatar.setPositionX(offsets[index] ?? 0);
    });

    this.avatar.position.x = 0;
  }

  private updateCamera(memberCount: number): void {
    const zoom = 1 + CAMERA_ZOOM_PER_MEMBER * Math.max(0, memberCount - 1);
    this.camera.position.z = BASE_CAMERA_Z * zoom;
  }

  private loop = (): void => {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const t = this.clock.getElapsedTime();
    this.avatar.rotation.y = Math.sin(t * 0.55) * 0.35;
    this.characterInstance?.update(delta);

    for (const avatar of this.remoteAvatars.values()) {
      avatar.update(delta, t);
    }

    this.grassField.update(t, { cameraPos: this.camera.position });

    const orbitAngle = t * 0.72;
    this.droneRoot.position.set(
      Math.cos(orbitAngle) * 1.35,
      2.05 + Math.sin(t * 1.25) * 0.28,
      -0.35 + Math.sin(orbitAngle) * 0.95,
    );
    this.droneRoot.rotation.y = orbitAngle + Math.PI * 0.55;
    this.droneRoot.rotation.z = Math.sin(orbitAngle * 1.4) * 0.14;

    const spin = t * 28;
    for (let i = 0; i < this.dronePropellers.length; i++) {
      this.dronePropellers[i]!.rotation.y = spin * (i % 2 === 0 ? 1 : -1);
    }

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
    this.clearLocalCharacter();
    this.characterTemplate = null;
    this.equippedWeaponId = null;
    this.grassField.dispose();
    this.labelRenderer.domElement.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
