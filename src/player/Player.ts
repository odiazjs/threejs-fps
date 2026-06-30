import * as THREE from 'three';
import { EYE_HEIGHT, stepPlayerPhysics, type PlayerPhysicsState } from '../../shared/level/collision';
import { getWeaponConfig, DEFAULT_LOADOUT_CONFIGS } from '../content/weaponConfig';
import {
  isWeaponId,
  LOADOUT_SIZE,
  LOADOUT_WEAPON_IDS,
  type WeaponId,
} from '../../shared/content/weaponIds';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { WeaponLoadout, type LoadoutAmmoState, resolveWeaponMeshRotation } from '../combat/WeaponLoadout';
import { readMuzzleFirePose, readWeaponMuzzleWorldPosition, projectMuzzleAimToScreenOffset } from '../combat/aiming';
import type { KeyboardInput } from '../input/KeyboardInput';
import { POINTER_ADS, POINTER_SHOOT, type PointerInput } from '../input/PointerInput';
import type { PlayerSnapshot } from '../network/types';
import { SPRINT_MULTIPLIER, SprintStamina, type SprintState } from './SprintStamina';
import { HeadBob } from './HeadBob';
import {
  createCharacterInstance,
  computeTopOffsetAboveFeet,
  gameModelFileForWeapon,
  loadGameCharacterTemplate,
  preloadGameCharacterModels,
  resolveCharacterRig,
  type CharacterInstance,
  type CharacterTemplate,
  type RemoteCharacterPose,
} from './characterModel';
import { getRemoteWeaponMount, type RemoteWeaponMount } from './remoteWeaponMount';
import { RemoteHealthBar } from './RemoteHealthBar';
import { DamageNumberStack } from '../ui/DamageNumberStack';
import { ShieldBreakFx } from '../effects/ShieldBreakFx';
import { ShieldRechargeAuraFx } from '../effects/ShieldRechargeAuraFx';
import { applyLookPitch, applyLookYaw, applyPlayerAim, readWorldPlayerAim, AIM_PITCH_LIMIT } from './playerAim';
import type { PointerAimControls } from './PointerAimControls';
import { WeaponPose } from './WeaponPose';
import { WeaponSway } from './WeaponSway';
import { createHitCapsuleDebugMesh, isHitCapsuleDebugEnabled } from '../combat/HitCapsuleDebugMesh';
import type { CrosshairHud } from '../ui/CrosshairHud';
import type { WeaponSoundService } from '../audio/WeaponSoundService';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import { getReloadState } from '../../shared/combat/reload';
import { getDefaultShieldPoints } from '../../shared/combat/shield';
import { getShieldRechargeState } from '../../shared/combat/shieldRecharge';
import { PlayerInventory } from '../inventory/PlayerInventory';
import type { InventoryWeaponEntry } from '../ui/InventoryHud';
const MOVE_SPEED = 3;
const REMOTE_INTERPOLATION_SPEED = 12;
const LOCAL_WEAPON_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0);
const _crosshairAimOffset = { x: 0, y: 0 };

const _spinePitchAxis = new THREE.Vector3(1, 0, 0);
const _spinePitchQuat = new THREE.Quaternion();

function lerpAngle(from: number, to: number, t: number): number {
  const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * t;
}

export type ShootCallback = (origin: THREE.Vector3, direction: THREE.Vector3) => void;
export type WeaponSwitchCallback = (slot: number, weaponId: WeaponId) => void;
export type ReloadNetworkCallback = (weaponId: WeaponId) => void;
export type ShieldRechargeNetworkCallback = () => void;

export class Player {
  readonly object = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera | null;
  /** Pointer-lock yaw target — mouse yaw applies here. */
  readonly aimRig: THREE.Group | null;
  /** Pointer-lock pitch target — mouse pitch applies here. */
  readonly pitchRig: THREE.Group | null;

  private aimControls: PointerAimControls | null = null;

  private loadout: WeaponLoadout | null = null;
  private readonly inventory = new PlayerInventory();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private targetPosition = new THREE.Vector3();
  private targetYaw = 0;
  private targetPitch = 0;
  private currentYaw = 0;
  private currentPitch = 0;
  private physics: PlayerPhysicsState = { verticalVelocity: 0, grounded: true };
  private sprint = new SprintStamina();
  private headBob = new HeadBob();
  private footstepSounds: FootstepSoundService | null = null;
  private headRig: THREE.Group | null = null;
  private yawRecoilRig: THREE.Group | null = null;
  private pitchRecoilRig: THREE.Group | null = null;
  private bodyRoot: THREE.Group | null = null;
  private pitchPivot: THREE.Group | null = null;
  private lookRig: THREE.Group | null = null;
  private remoteUiRig: THREE.Group | null = null;
  private handRig: THREE.Group | null = null;
  private spineBone: THREE.Object3D | null = null;
  private lookRigFollowsHead = false;
  private characterInstance: CharacterInstance | null = null;
  private displayedCharacterModelFile: string | null = null;
  private remoteWeaponMount: RemoteWeaponMount | null = null;
  private remoteHealthBar: RemoteHealthBar | null = null;
  private damageNumberStack: DamageNumberStack | null = null;
  private shieldBreakFx: ShieldBreakFx | null = null;
  private shieldRechargeAuraFx: ShieldRechargeAuraFx | null = null;
  private onShieldBreakListener: (() => void) | null = null;
  private muzzleOrigin = new THREE.Vector3();
  private aimDirection = new THREE.Vector3();
  private weaponPose: WeaponPose | null = null;
  private weaponSway: WeaponSway | null = null;
  private onShoot: ShootCallback | null = null;
  private onReloadNetwork: ReloadNetworkCallback | null = null;
  private onWeaponSwitchNetwork: WeaponSwitchCallback | null = null;
  private onShieldRechargeNetwork: ShieldRechargeNetworkCallback | null = null;
  private targetReloadEndAt = 0;
  private targetActiveWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private targetSprinting = false;
  private targetWalking = false;
  private targetJumping = false;
  private targetShieldRecharging = false;
  private targetShieldRechargeEndAt = 0;
  private locomotionWalking = false;
  private locomotionJumping = false;
  private remoteDisplayedWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private readonly remoteWeaponBasePosition = new THREE.Vector3();
  private readonly remoteWeaponBaseRotation = new THREE.Euler();
  private readonly activeMeshBaseRotation = new THREE.Euler();
  private fireCooldown = 0;
  private weaponSounds: WeaponSoundService | null = null;
  private projectileSpawnOptions: {
    canHitPlayers: boolean;
    ownerTeamId: number;
    ownerSessionId: string;
  } = { canHitPlayers: false, ownerTeamId: -1, ownerSessionId: '' };
  private teamId = 0;
  private alive = true;
  private username = 'Player';
  private hp = 100;
  private shieldPoints = getDefaultShieldPoints();
  private hitCapsuleDebug: THREE.Group | null = null;

  private constructor(local: boolean) {
    this.loadout = new WeaponLoadout(DEFAULT_LOADOUT_CONFIGS);

    if (local) {
      this.headRig = new THREE.Group();
      this.yawRecoilRig = new THREE.Group();
      this.aimRig = new THREE.Group();
      this.pitchRig = new THREE.Group();
      this.pitchRecoilRig = new THREE.Group();
      this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
      );
      // Pitch rotates around the eyes, not the feet — keeps view height fixed while looking up/down.
      this.camera.position.set(0, 0, 0);
      this.pitchRig.position.set(0, EYE_HEIGHT, 0);
      this.pitchRecoilRig.add(this.camera);
      this.pitchRig.add(this.pitchRecoilRig);
      this.aimRig.add(this.pitchRig);
      this.yawRecoilRig.add(this.aimRig);
      this.headRig.add(this.yawRecoilRig);
      this.object.add(this.headRig);
      this.weaponPose = new WeaponPose();
      this.weaponPose.setViewConfig(this.loadout.getActive().config.view);
      this.weaponSway = new WeaponSway();
      this.loadout.attach(this.camera, LOCAL_WEAPON_ROTATION, 'local');
    } else {
      this.camera = null;
      this.aimRig = null;
      this.pitchRig = null;
      this.bodyRoot = new THREE.Group();
      this.pitchPivot = new THREE.Group();
      this.lookRig = new THREE.Group();
      this.remoteUiRig = new THREE.Group();

      this.bodyRoot.add(this.pitchPivot);
      this.object.add(this.bodyRoot);
      this.object.add(this.lookRig);
      this.object.add(this.remoteUiRig);

      this.weaponPose = new WeaponPose();
      this.loadout.attach(this.lookRig, LOCAL_WEAPON_ROTATION, 'remote');

      this.remoteHealthBar = new RemoteHealthBar();
      this.remoteUiRig.add(this.remoteHealthBar.object);

      this.damageNumberStack = new DamageNumberStack();
      this.remoteUiRig.add(this.damageNumberStack.object);

      this.shieldBreakFx = new ShieldBreakFx();
      this.object.add(this.shieldBreakFx.object);

      this.shieldRechargeAuraFx = new ShieldRechargeAuraFx();
      this.object.add(this.shieldRechargeAuraFx.object);
    }
  }

  static createLocal(): Player {
    const player = new Player(true);
    player.setProjectileSpawnOptions(0);
    return player;
  }

  static createRemote(_color = 0x6a9fd4): Player {
    return new Player(false);
  }

  static async preloadGameCharacterModels(): Promise<void> {
    await preloadGameCharacterModels();
  }

  async syncRemoteCharacterModel(worldTime: number): Promise<void> {
    if (this.camera) return;

    const weaponId = this.targetActiveWeaponId;
    const pose = this.getRemotePose(worldTime);
    const modelFile = gameModelFileForWeapon(weaponId, pose);
    if (this.displayedCharacterModelFile === modelFile && this.characterInstance) return;

    const template = await loadGameCharacterTemplate(weaponId, pose);
    this.setCharacterModel(template);
    this.applyRemoteAim();
    this.characterInstance?.update(0);
    this.applyRemoteSpinePitch();
  }

  private getRemotePose(worldTime: number): RemoteCharacterPose {
    const { reloading } = getReloadState(
      this.targetReloadEndAt,
      worldTime,
      this.targetActiveWeaponId,
    );
    return {
      sprinting: this.targetSprinting,
      walking: this.targetWalking,
      jumping: this.targetJumping,
      reloading,
    };
  }

  setCharacterModel(template: CharacterTemplate): void {
    if (!this.pitchPivot || !this.lookRig || !this.loadout || this.camera) return;
    if (this.displayedCharacterModelFile === template.modelFile && this.characterInstance) return;

    if (this.lookRigFollowsHead && this.lookRig.parent) {
      this.lookRig.parent.remove(this.lookRig);
      this.object.add(this.lookRig);
      this.lookRigFollowsHead = false;
    }

    this.characterInstance?.dispose();
    this.characterInstance = createCharacterInstance(template);
    this.pitchPivot.add(this.characterInstance.root);
    this.displayedCharacterModelFile = template.modelFile;
    this.bindRemoteCharacterRig(template);
  }

  private bindRemoteCharacterRig(template: CharacterTemplate): void {
    if (!this.characterInstance || !this.lookRig || !this.loadout) return;

    const rig = resolveCharacterRig(this.characterInstance.root, template.bones);
    if (!rig) {
      console.warn('[Player] Character hand/head bones not found');
      return;
    }

    this.refreshRemoteWeaponMount(template.modelFile);

    this.handRig = new THREE.Group();
    this.handRig.name = 'remoteHandRig';
    this.handRig.position.copy(this.remoteWeaponMount!.handPosition);
    this.handRig.rotation.copy(this.remoteWeaponMount!.handRotation);
    rig.rightHand.add(this.handRig);
    this.spineBone = rig.spine;

    const mount = this.remoteWeaponMount!;
    this.loadout.reattach(
      this.handRig,
      mount.weaponRotation,
      'remote',
      template.fitScale,
      mount.weaponPosition,
    );

    this.object.remove(this.lookRig);
    this.lookRig.position.set(0, 0, 0);
    this.lookRig.rotation.set(0, 0, 0);
    rig.head.add(this.lookRig);
    this.lookRigFollowsHead = true;
  }

  private refreshRemoteWeaponMount(modelFile: string): void {
    if (!this.loadout) return;

    this.remoteWeaponMount = getRemoteWeaponMount(
      modelFile,
      this.loadout.getActiveWeaponId(),
    );
    this.remoteWeaponBasePosition.copy(this.remoteWeaponMount.weaponPosition);
    this.remoteWeaponBaseRotation.copy(this.remoteWeaponMount.weaponRotation);
  }

  attachToScene(scene: THREE.Scene): void {
    scene.add(this.object);
    if (isHitCapsuleDebugEnabled() && !this.camera) {
      this.hitCapsuleDebug = createHitCapsuleDebugMesh();
      this.object.add(this.hitCapsuleDebug);
    }
  }

  bindAimControls(controls: PointerAimControls): void {
    this.aimControls = controls;
  }

  getSprintState(): SprintState {
    return this.sprint.getState();
  }

  getLocomotionState(): { isSprinting: boolean; isWalking: boolean; isJumping: boolean } {
    if (this.camera) {
      return {
        isSprinting: this.sprint.getState().isSprinting,
        isWalking: this.locomotionWalking,
        isJumping: this.locomotionJumping,
      };
    }

    return {
      isSprinting: this.targetSprinting,
      isWalking: this.targetWalking,
      isJumping: this.targetJumping,
    };
  }

  getAmmoState(): LoadoutAmmoState | null {
    return this.loadout?.getAmmoState() ?? null;
  }

  getInventory(): PlayerInventory {
    return this.inventory;
  }

  getInventoryWeapons(): InventoryWeaponEntry[] {
    if (!this.loadout) return [];

    const activeIndex = this.loadout.getActiveIndex();
    return Array.from({ length: LOADOUT_SIZE }, (_, slotIndex) => {
      const weaponId = this.loadout!.getSlotWeaponId(slotIndex);
      const occupied = weaponId !== null;
      return {
        slotIndex,
        weaponId,
        name: occupied ? (getWeaponConfig(weaponId)!.name) : 'Empty',
        active: occupied && slotIndex === activeIndex,
        occupied,
      };
    });
  }

  applyLoadoutFromSnapshot(snapshot: PlayerSnapshot): void {
    if (!this.loadout || !this.camera) return;

    this.loadout.applyServerSlots(snapshot, snapshot.activeWeaponId);
    if (isWeaponId(snapshot.activeWeaponId)) {
      this.targetActiveWeaponId = snapshot.activeWeaponId;
      this.loadout.setRemoteActiveWeapon(snapshot.activeWeaponId);
      this.weaponPose?.setViewConfig(this.loadout.getActive().config.view);
    }
  }

  getAdsBlend(): number {
    return this.weaponPose?.adsBlend ?? 0;
  }

  getActiveWeaponId(): WeaponId {
    return this.loadout?.getActiveWeaponId() ?? LOADOUT_WEAPON_IDS[0];
  }

  getActiveDamage(): number {
    return this.loadout?.getActiveDamage() ?? 5;
  }

  addReserveClip(): void {
    this.loadout?.addReserveToActive();
  }

  refillAmmo(): void {
    this.loadout?.refillAllAmmo();
  }

  setShootCallback(callback: ShootCallback | null): void {
    this.onShoot = callback;
  }

  setWeaponSoundService(service: WeaponSoundService | null): void {
    this.weaponSounds = service;
  }

  setFootstepSoundService(service: FootstepSoundService | null): void {
    this.footstepSounds = service;
  }

  setReloadNetworkCallback(callback: ReloadNetworkCallback | null): void {
    this.onReloadNetwork = callback;
  }

  setWeaponSwitchNetworkCallback(callback: WeaponSwitchCallback | null): void {
    this.onWeaponSwitchNetwork = callback;
  }

  setShieldRechargeNetworkCallback(callback: ShieldRechargeNetworkCallback | null): void {
    this.onShieldRechargeNetwork = callback;
  }

  setProjectileSpawnOptions(ownerTeamId: number, ownerSessionId = ''): void {
    this.projectileSpawnOptions = {
      canHitPlayers: true,
      ownerTeamId,
      ownerSessionId,
    };
  }

  getTeamId(): number {
    return this.teamId;
  }

  isAlive(): boolean {
    return this.alive;
  }

  getUsername(): string {
    return this.username;
  }

  getHp(): number {
    return this.hp;
  }

  updateCrosshairAim(hud: CrosshairHud, width: number, height: number): void {
    if (!this.camera || !this.loadout) {
      hud.setAimOffset(0, 0);
      return;
    }

    projectMuzzleAimToScreenOffset(
      this.loadout.getActive().mesh,
      this.camera,
      width,
      height,
      _crosshairAimOffset,
    );
    hud.setAimOffset(_crosshairAimOffset.x, _crosshairAimOffset.y);
  }

  getFeetPosition(): THREE.Vector3 {
    return this.object.position;
  }

  /** Third-person active weapon muzzle in world space (remote observers). */
  readActiveMuzzleWorldPosition(position: THREE.Vector3, weaponId?: WeaponId): boolean {
    if (!this.loadout || this.camera) return false;

    let mesh = this.loadout.getActive().mesh;
    if (weaponId) {
      for (let i = 0; i < LOADOUT_SIZE; i++) {
        const slot = this.loadout.getSlot(i);
        if (slot?.config.id === weaponId) {
          mesh = slot.mesh;
          break;
        }
      }
    }

    this.object.updateMatrixWorld(true);
    readWeaponMuzzleWorldPosition(mesh, position);
    return true;
  }

  getNetworkAim(): { yaw: number; pitch: number } {
    if (!this.camera) return { yaw: 0, pitch: 0 };
    this.object.updateMatrixWorld(true);
    return readWorldPlayerAim(this.camera);
  }

  setEyePosition(x: number, y: number, z: number): void {
    this.object.position.set(x, y - EYE_HEIGHT, z);
    this.object.rotation.set(0, 0, 0);
    this.physics = { verticalVelocity: 0, grounded: true };
    this.resetLocalView();
  }

  private resetLocalView(): void {
    if (!this.camera) return;

    this.headBob.reset();
    this.footstepSounds?.reset();
    if (this.headRig) {
      this.headRig.position.set(0, 0, 0);
      this.headRig.rotation.set(0, 0, 0);
      this.headBob.apply(this.headRig, false);
    }

    applyLookYaw(this.aimRig!, 0);
    applyLookPitch(this.pitchRig!, 0);
    this.aimControls?.resetLook();
    this.loadout?.reset();
    this.weaponPose?.reset();
    this.weaponSway?.reset();
    if (this.loadout) {
      this.weaponPose?.setViewConfig(this.loadout.getActive().config.view);
    }
    if (this.yawRecoilRig && this.pitchRecoilRig) {
      this.applyActiveRecoilAim();
    }
    this.stabilizeCameraPitch();
    this.applyActiveWeaponPose();
    this.weaponPose?.applyCamera(this.camera);
    this.fireCooldown = 0;
  }

  setFromSnapshot(snapshot: PlayerSnapshot, snap = false): void {
    this.targetPosition.set(snapshot.x, snapshot.y - EYE_HEIGHT, snapshot.z);
    this.targetYaw = snapshot.yaw;
    this.targetPitch = snapshot.pitch;
    this.targetReloadEndAt = snapshot.reloadEndAt;
    if (isWeaponId(snapshot.activeWeaponId)) {
      this.targetActiveWeaponId = snapshot.activeWeaponId;
      this.loadout?.setRemoteActiveWeapon(snapshot.activeWeaponId);
    }
    this.targetSprinting = snapshot.sprinting;
    this.targetWalking = snapshot.walking;
    this.targetJumping = snapshot.jumping;
    this.targetShieldRecharging = snapshot.shieldRecharging;
    this.targetShieldRechargeEndAt = snapshot.shieldRechargeEndAt;
    this.teamId = snapshot.teamId;
    this.alive = snapshot.alive;
    this.username = snapshot.username;

    if (!this.camera) {
      if (snapshot.alive) {
        const hpLoss = Math.max(0, this.hp - snapshot.hp);
        const shieldLoss = Math.max(0, this.shieldPoints - snapshot.shieldPoints);
        const totalDamage = Math.floor(hpLoss + shieldLoss);
        if (totalDamage > 0) {
          this.showDamageNumber(totalDamage);
        }
        if (this.shieldPoints > 0 && snapshot.shieldPoints <= 0) {
          this.shieldBreakFx?.play();
          this.onShieldBreakListener?.();
        }
      }
      this.object.visible = snapshot.alive;
      this.remoteHealthBar?.update(snapshot.hp, snapshot.alive, snapshot.teamId, snapshot.username);
      if (!snapshot.alive) {
        this.damageNumberStack?.clear();
      }
    }

    this.hp = snapshot.hp;
    this.shieldPoints = snapshot.shieldPoints;
    if (this.camera) {
      this.inventory.setShieldCharges(snapshot.shieldCharges);
    } else if (this.loadout && isWeaponId(snapshot.activeWeaponId)) {
      this.loadout.applyServerSlots(snapshot, snapshot.activeWeaponId);
      this.loadout.setRemoteActiveWeapon(snapshot.activeWeaponId);
      this.targetActiveWeaponId = snapshot.activeWeaponId;
    }

    if (snap) {
      this.object.position.copy(this.targetPosition);
      this.currentYaw = snapshot.yaw;
      this.currentPitch = snapshot.pitch;
      this.applyRemoteAim();
      this.characterInstance?.update(0);
      this.applyRemoteSpinePitch();
    }
  }

  interpolateRemote(delta: number): void {
    if (this.camera) return;

    const t = 1 - Math.exp(-REMOTE_INTERPOLATION_SPEED * delta);
    this.object.position.lerp(this.targetPosition, t);
    this.currentYaw = lerpAngle(this.currentYaw, this.targetYaw, t);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, t);
    this.applyRemoteAim();
    this.characterInstance?.update(delta);
    this.applyRemoteSpinePitch();
  }

  updateRemoteHealthBar(camera: THREE.Camera): void {
    this.syncRemoteUiHeight();
    this.remoteHealthBar?.updateLayout(camera);
  }

  private syncRemoteUiHeight(): void {
    if (!this.remoteHealthBar) return;

    const clearance = 0.38;
    const topOffset = this.characterInstance
      ? computeTopOffsetAboveFeet(this.characterInstance.root, this.object, clearance)
      : EYE_HEIGHT + clearance;

    this.remoteHealthBar.setHeadTopOffset(topOffset);
    this.damageNumberStack?.setHeadTopOffset(topOffset + 0.16);
  }

  showDamageNumber(amount: number): void {
    this.damageNumberStack?.push(amount);
  }

  setShieldBreakListener(listener: (() => void) | null): void {
    this.onShieldBreakListener = listener;
  }

  updateDamageNumbers(delta: number, camera: THREE.Camera): void {
    this.damageNumberStack?.update(delta, camera);
    this.shieldBreakFx?.update(delta, camera);
  }

  updateRemoteShieldRecharge(delta: number, worldTime: number, camera: THREE.Camera): void {
    if (!this.shieldRechargeAuraFx) return;

    const state = getShieldRechargeState(
      this.targetShieldRecharging,
      this.targetShieldRechargeEndAt,
      worldTime,
    );
    const visible = state.recharging && this.alive;
    this.shieldRechargeAuraFx.setActive(visible);
    if (!visible) return;

    this.shieldRechargeAuraFx.update(delta, camera, state.progress);
  }

  updateRemoteWeapon(delta: number, worldTime: number): void {
    if (this.camera || !this.weaponPose || !this.loadout) return;

    const weaponChanged = this.targetActiveWeaponId !== this.remoteDisplayedWeaponId;
    if (weaponChanged) {
      this.loadout.setRemoteActiveWeapon(this.targetActiveWeaponId);
      this.remoteDisplayedWeaponId = this.targetActiveWeaponId;
      this.weaponPose.setViewConfig(this.loadout.getActive().config.view);
      this.weaponPose.startSwitch(this.loadout.getSwitchReadySec());
      if (this.displayedCharacterModelFile) {
        this.refreshRemoteWeaponMount(this.displayedCharacterModelFile);
      }
    }

    if (!this.remoteWeaponMount) return;

    const active = this.loadout.getActive();
    this.remoteWeaponBasePosition.copy(this.remoteWeaponMount.weaponPosition);
    resolveWeaponMeshRotation(
      this.remoteWeaponMount.weaponRotation,
      active.config.view,
      'remote',
      this.remoteWeaponBaseRotation,
    );
    this.loadout.applyActiveRotation(this.remoteWeaponMount.weaponRotation, 'remote');
    this.weaponPose.update(delta, false, false, 0);
    this.weaponPose.applyRemoteReload(
      active.mesh,
      this.remoteWeaponBasePosition,
      this.remoteWeaponBaseRotation,
    );
  }

  update(
    delta: number,
    input: KeyboardInput,
    pointer: PointerInput,
    canAct: boolean,
    projectiles: ProjectileManager | null = null,
  ): void {
    if (!this.camera || !this.loadout) return;

    if (!canAct) {
      this.weaponSounds?.stopAutoFire();
      this.headBob.update(delta, false, false);
      if (this.headRig) this.headBob.apply(this.headRig, false);
      if (this.aimControls) this.aimControls.pointerSpeed = 1;
      return;
    }

    this.trySwitchWeapon(input);
    this.tryStartShieldRecharge(input);

    if (input.isJustPressed('KeyR')) {
      if (
        this.loadout.isWeaponReady() &&
        !this.weaponPose?.isSwitching() &&
        this.loadout.getActive().ammo.tryReload()
      ) {
        this.weaponSounds?.playReload(this.loadout.getActive().config.sounds);
        this.onReloadNetwork?.(this.loadout.getActiveWeaponId());
      }
    }

    const ads = pointer.isPressed(POINTER_ADS);
    const active = this.loadout.getActive();
    const ammoState = active.ammo.getState();
    if (ammoState.reloading) {
      this.weaponSounds?.stopAutoFire();
    }
    const shooting = this.isFiring(pointer, active.config.fireMode);

    const wantsSprint =
      input.isPressed('ShiftLeft') &&
      input.isPressed('KeyW') &&
      this.physics.grounded;
    const isSprinting = this.sprint.update(delta, wantsSprint);
    const isMoving =
      this.physics.grounded &&
      (input.isPressed('KeyW') ||
        input.isPressed('KeyS') ||
        input.isPressed('KeyA') ||
        input.isPressed('KeyD'));
    const isWalking = isMoving && !isSprinting;
    this.locomotionWalking = isWalking;

    this.loadout.update(delta);

    this.weaponPose?.setViewConfig(active.config.view);
    this.weaponPose?.update(
      delta,
      ads,
      ammoState.reloading,
      ammoState.reloadProgress,
    );
    if (this.aimControls) {
      const adsLookSensitivity = active.config.view.adsLookSensitivity ?? 1;
      const adsBlend = this.weaponPose?.adsBlend ?? 0;
      this.aimControls.pointerSpeed = THREE.MathUtils.lerp(1, adsLookSensitivity, adsBlend);
    }
    this.weaponSway?.update(
      delta,
      isWalking,
      isSprinting,
      shooting,
      this.physics.grounded,
      this.weaponPose?.adsBlend ?? 0,
      active.config.sway,
    );
    active.recoil.update(delta, shooting, ads);
    if (this.yawRecoilRig && this.pitchRecoilRig) {
      this.applyActiveRecoilAim();
    }
    this.stabilizeCameraPitch();
    this.applyActiveWeaponPose();
    this.weaponPose?.applyCamera(this.camera);
    const baseRotation = this.getActiveMeshBaseRotation();
    const weaponRotation = this.weaponPose?.getWeaponRotation(baseRotation) ?? baseRotation;
    active.recoil.applyWeaponVisual(
      active.mesh,
      weaponRotation,
      this.weaponPose?.adsBlend ?? 0,
    );
    this.weaponSway?.apply(
      active.mesh,
      this.weaponPose!.hipOffset,
      weaponRotation,
    );

    this.updateFire(delta, pointer, projectiles);

    const speed = MOVE_SPEED * delta;

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();

    this.right.crossVectors(this.forward, this.camera.up).normalize();

    const forwardSpeed = speed * (isSprinting ? SPRINT_MULTIPLIER : 1);

    let deltaX = 0;
    let deltaZ = 0;

    if (input.isPressed('KeyW')) {
      deltaX += this.forward.x * forwardSpeed;
      deltaZ += this.forward.z * forwardSpeed;
    }
    if (input.isPressed('KeyS')) {
      deltaX -= this.forward.x * speed;
      deltaZ -= this.forward.z * speed;
    }
    if (input.isPressed('KeyD')) {
      deltaX += this.right.x * speed;
      deltaZ += this.right.z * speed;
    }
    if (input.isPressed('KeyA')) {
      deltaX -= this.right.x * speed;
      deltaZ -= this.right.z * speed;
    }

    const jump = input.isJustPressed('Space');
    const wasGrounded = this.physics.grounded;
    const result = stepPlayerPhysics(
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      this.physics,
      deltaX,
      deltaZ,
      jump,
      delta,
    );

    this.object.position.set(result.x, result.y, result.z);
    this.physics = result.state;

    if (jump && wasGrounded) {
      this.locomotionJumping = true;
    }
    if (this.physics.grounded) {
      this.locomotionJumping = false;
    }

    const groundedMoving = isMoving && this.physics.grounded;
    this.footstepSounds?.update(delta, groundedMoving, isSprinting);

    this.headBob.update(delta, isMoving, isSprinting);
    if (this.headRig) this.headBob.apply(this.headRig, isSprinting);
  }

  resize(): void {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.remoteHealthBar?.dispose();
    this.remoteHealthBar = null;
    this.damageNumberStack?.dispose();
    this.damageNumberStack = null;
    this.shieldBreakFx?.dispose();
    this.shieldBreakFx = null;
    this.shieldRechargeAuraFx?.dispose();
    this.shieldRechargeAuraFx = null;
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.displayedCharacterModelFile = null;
    this.remoteWeaponMount = null;
    this.handRig = null;
    this.spineBone = null;
    this.lookRigFollowsHead = false;
    this.loadout?.dispose();
    this.loadout = null;
    this.hitCapsuleDebug = null;
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.object.removeFromParent();
  }

  private trySwitchWeapon(input: KeyboardInput): void {
    if (!this.loadout) return;

    for (let slot = 0; slot < LOADOUT_SIZE; slot++) {
      const code = `Digit${slot + 1}`;
      if (!input.isJustPressed(code)) continue;
      if (!this.loadout.trySwitch(slot)) continue;

      this.weaponSounds?.stopAutoFire();
      this.weaponPose?.setViewConfig(this.loadout.getActive().config.view);
      this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
      this.loadout.applyActiveRotation(LOCAL_WEAPON_ROTATION, 'local');
      this.onWeaponSwitchNetwork?.(slot, this.loadout.getActiveWeaponId());
      break;
    }
  }

  private tryStartShieldRecharge(input: KeyboardInput): void {
    if (!input.isJustPressed('Digit4')) return;
    this.onShieldRechargeNetwork?.();
  }

  private isFiring(pointer: PointerInput, fireMode: 'auto' | 'semi'): boolean {
    return fireMode === 'semi'
      ? pointer.isJustPressed(POINTER_SHOOT)
      : pointer.isPressed(POINTER_SHOOT);
  }

  private updateFire(
    delta: number,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!this.loadout) return;

    if (!pointer.isPressed(POINTER_SHOOT)) {
      this.weaponSounds?.stopAutoFire();
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);

    const active = this.loadout.getActive();
    const wantsFire = this.isFiring(pointer, active.config.fireMode);
    if (!wantsFire) return;

    if (!this.loadout.isWeaponReady() || this.weaponPose?.isSwitching()) return;
    if (this.fireCooldown > 0) return;

    if (!this.shoot(projectiles)) {
      const state = active.ammo.getState();
      if (state.clip <= 0 && !state.reloading) {
        this.weaponSounds?.playOutOfAmmo();
        this.fireCooldown += active.fireInterval;
      }
      return;
    }

    this.fireCooldown += active.fireInterval;
  }

  private shoot(projectiles: ProjectileManager | null): boolean {
    if (!this.camera || !this.loadout || !projectiles) return false;

    const active = this.loadout.getActive();
    if (!active.ammo.tryShoot()) {
      this.weaponSounds?.stopAutoFire();
      return false;
    }

    if (active.config.fireMode === 'auto') {
      this.weaponSounds?.startAutoFire(active.config.sounds);
    } else {
      this.weaponSounds?.playSingleShot(active.config.sounds);
    }

    active.recoil.onShot(this.weaponPose?.adsBlend ?? 0);
    this.object.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    active.mesh.updateMatrixWorld(true);

    readMuzzleFirePose(
      active.mesh,
      this.camera,
      this.muzzleOrigin,
      this.aimDirection,
    );
    projectiles.spawn(this.muzzleOrigin, this.aimDirection, {
      ...this.projectileSpawnOptions,
      muzzleFlash: active.config.muzzleFlash,
      speed: active.config.projectileSpeed,
    });
    this.onShoot?.(this.muzzleOrigin, this.aimDirection);
    return true;
  }

  private getActiveRecoil() {
    return this.loadout?.getActive().recoil ?? null;
  }

  private applyActiveRecoilAim(): void {
    const recoil = this.getActiveRecoil();
    if (!recoil || !this.yawRecoilRig || !this.pitchRecoilRig || !this.pitchRig) return;
    const basePitch = this.aimControls?.lookPitch ?? this.pitchRig.rotation.x;
    recoil.applyAim(this.yawRecoilRig, this.pitchRecoilRig, basePitch);
  }

  /** Corrects euler drift so world pitch never flips past vertical. */
  private stabilizeCameraPitch(): void {
    if (!this.camera || !this.aimControls || !this.pitchRig || !this.pitchRecoilRig) return;

    this.object.updateMatrixWorld(true);
    const { pitch } = readWorldPlayerAim(this.camera);
    if (Math.abs(pitch) <= AIM_PITCH_LIMIT) return;

    const clamped = THREE.MathUtils.clamp(pitch, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
    const recoilPitch = this.pitchRecoilRig.rotation.x;
    const lookPitch = THREE.MathUtils.clamp(
      clamped - recoilPitch,
      -AIM_PITCH_LIMIT,
      AIM_PITCH_LIMIT,
    );

    this.aimControls.lookPitch = lookPitch;
    applyLookPitch(this.pitchRig, lookPitch);
    this.pitchRecoilRig.rotation.set(clamped - lookPitch, 0, 0);
  }

  private applyActiveWeaponPose(): void {
    if (!this.loadout) return;
    this.weaponPose?.apply(this.loadout.getActive().mesh);
  }

  private getActiveMeshBaseRotation(): THREE.Euler {
    const active = this.loadout!.getActive();
    return resolveWeaponMeshRotation(
      LOCAL_WEAPON_ROTATION,
      active.config.view,
      'local',
      this.activeMeshBaseRotation,
    );
  }

  private applyRemoteAim(): void {
    if (!this.bodyRoot || !this.pitchPivot || !this.lookRig) return;

    this.bodyRoot.rotation.set(0, this.currentYaw, 0);
    this.pitchPivot.rotation.set(0, 0, 0);

    if (!this.lookRigFollowsHead) {
      applyPlayerAim(this.lookRig, this.currentYaw, this.currentPitch);
    }
  }

  /** Pitch on the spine (waist up) so legs stay grounded in the idle pose. */
  private applyRemoteSpinePitch(): void {
    if (!this.spineBone) return;

    _spinePitchQuat.setFromAxisAngle(_spinePitchAxis, -this.currentPitch);
    this.spineBone.quaternion.multiply(_spinePitchQuat);
  }
}
