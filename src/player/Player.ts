import * as THREE from 'three';
import { EYE_HEIGHT, type PlayerPhysicsState } from '../../shared/level/collision';
import { stepPlayerPhysicsClient } from './levelMovement';
import { DEFAULT_MAP_ID, getMapDef, type MapCollisionDef } from '../../shared/level/maps';
import { getWeaponConfig, DEFAULT_LOADOUT_CONFIGS, KATANA_CONFIG } from '../content/weaponConfig';
import {
  isWeaponId,
  LOADOUT_SIZE,
  LOADOUT_WEAPON_IDS,
  MELEE_WEAPON_ID,
  type WeaponId,
} from '../../shared/content/weaponIds';
import type { WeaponFireMode } from '../../shared/content/weaponConfig';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { ShieldDomeAbility } from '../combat/ShieldDomeAbility';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import { bodyPartVolumesFromBoneRefs, type BodyPartVolume } from '../../shared/combat/bodyPartVolumes';
import { WeaponLoadout, type LoadoutAmmoState, resolveWeaponMeshRotation, getLocalWeaponBaseRotation, getRemoteWeaponBaseRotation } from '../combat/WeaponLoadout';
import { readCrosshairWorldRay, readMuzzleFirePose, readWeaponMuzzleWorldPosition, projectMuzzleAimToScreenOffset } from '../combat/aiming';
import type { KeyboardInput } from '../input/KeyboardInput';
import { POINTER_ADS, POINTER_SHOOT, type PointerInput } from '../input/PointerInput';
import type { PlayerSnapshot } from '../network/types';
import { EMPTY_WEAPON_SLOT } from '../../shared/loadout/loadoutSlots';
import { SPRINT_MULTIPLIER, SprintStamina, type SprintState } from './SprintStamina';
import { HeadBob } from './HeadBob';
import {
  createCharacterInstance,
  computeTopOffsetAboveFeet,
  CHARACTER_MODEL_FILES,
  gameModelFileForWeapon,
  loadDeathCharacterTemplate,
  loadGameCharacterTemplate,
  preloadGameCharacterModels,
  readBodyPartBoneRefsWorld,
  resolveBodyPartBones,
  resolveCharacterRig,
  type BodyPartBones,
  type CharacterInstance,
  type CharacterTemplate,
  type RemoteCharacterPose,
} from './characterModel';
import { getRemoteWeaponMount, type RemoteWeaponMount } from './remoteWeaponMount';
import { RemoteHealthBar } from './RemoteHealthBar';
import type { RemotePlayerUiVisibilityState } from './remotePlayerUiVisibility';
import { DamageNumberStack, DAMAGE_NUMBER_HEIGHT_SCALE } from '../ui/DamageNumberStack';
import { ShieldBreakFx } from '../effects/ShieldBreakFx';
import { MeleeHitFx } from '../effects/MeleeHitFx';
import { ShieldRechargeAuraFx } from '../effects/ShieldRechargeAuraFx';
import { applyLookPitch, applyLookYaw, applyPlayerAim, readWorldPlayerAim, AIM_PITCH_LIMIT } from './playerAim';
import type { PointerAimControls } from './PointerAimControls';
import { WeaponPose } from './WeaponPose';
import { WeaponSway } from './WeaponSway';
import { KatanaSlashTrailFx, KATANA_SLASH_DURATION_SEC } from '../effects/KatanaSlashTrailFx';
import { createHitCapsuleDebugMesh, isHitCapsuleDebugEnabled, updateHitCapsuleDebugMesh } from '../combat/HitCapsuleDebugMesh';
import {
  attachAxisDebugArrowsIfEnabled,
  type AxisDebugArrows,
} from '../debug/AxisDebugArrows';
import type { CrosshairHud } from '../ui/CrosshairHud';
import type { WeaponSoundService } from '../audio/WeaponSoundService';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import { getReloadState } from '../../shared/combat/reload';
import {
  getMeleeAttackAnimState,
  getWeaponSwitchAnimState,
  REMOTE_DEATH_DISPLAY_SEC,
  REMOTE_DEATH_GROUND_DROP,
} from '../../shared/combat/characterAnim';
import { getDefaultShieldPoints, SHIELD_DEFAULT_LEVEL } from '../../shared/combat/shield';
import { getShieldRechargeState } from '../../shared/combat/shieldRecharge';
import {
  CROUCH_EYE_DROP,
  CROUCH_SPEED_MULTIPLIER,
  feetYFromNetworkEyeY,
} from '../../shared/combat/crouch';
import { PlayerInventory } from '../inventory/PlayerInventory';
import type { InventoryWeaponEntry, InventoryMeleeEntry } from '../ui/InventoryHud';
import { getClientPhysicsWorld } from '../physics/buildMapPhysics';
import {
  applyForwardLimbWallClearance,
  measureForwardLimbClearanceFactor,
  measureViewWeaponWallPullback,
} from '../../shared/physics/forwardWallClearance';
import { aimDirectionFromYawPitch } from '../../shared/combat/meleeHit';
const MOVE_SPEED = 3;
const CROUCH_CAMERA_BLEND_SPEED = 12;
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
export type AutoFireStopCallback = () => void;
export type WeaponSwitchCallback = (slot: number, weaponId: WeaponId) => void;
export type MeleeEquipCallback = (equipped: boolean) => void;
export type MeleeAttackNetworkCallback = () => void;
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
  private mapCollisionDef: MapCollisionDef = getMapDef(DEFAULT_MAP_ID);
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
  private meleeAttackAnimConsumed = false;
  private weaponSwitchAnimConsumed = false;
  private remoteWeaponMount: RemoteWeaponMount | null = null;
  private remoteKatanaAxisDebug: AxisDebugArrows | null = null;
  private remoteHealthBar: RemoteHealthBar | null = null;
  private remoteHeadTopOffset = EYE_HEIGHT + 0.38;
  private damageNumberStack: DamageNumberStack | null = null;
  private shieldBreakFx: ShieldBreakFx | null = null;
  private meleeHitFx: MeleeHitFx | null = null;
  private shieldRechargeAuraFx: ShieldRechargeAuraFx | null = null;
  private onShieldBreakListener: (() => void) | null = null;
  private muzzleOrigin = new THREE.Vector3();
  private aimDirection = new THREE.Vector3();
  private hitRayOrigin = new THREE.Vector3();
  private hitRayDirection = new THREE.Vector3();
  private weaponPose: WeaponPose | null = null;
  private weaponSway: WeaponSway | null = null;
  private katanaSlashFx: KatanaSlashTrailFx | null = null;
  private onShoot: ShootCallback | null = null;
  private onAutoFireStopNetwork: AutoFireStopCallback | null = null;
  private onReloadNetwork: ReloadNetworkCallback | null = null;
  private onWeaponSwitchNetwork: WeaponSwitchCallback | null = null;
  private onMeleeEquipNetwork: MeleeEquipCallback | null = null;
  private onMeleeAttackNetwork: MeleeAttackNetworkCallback | null = null;
  private onShieldRechargeNetwork: ShieldRechargeNetworkCallback | null = null;
  private shieldDomeAbility: ShieldDomeAbility | null = null;
  private shieldDomeWorldTime: (() => number) | null = null;
  private targetReloadEndAt = 0;
  private targetWeaponSwitchEndAt = 0;
  private targetMeleeAttackEndAt = 0;
  private targetActiveWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private targetSprinting = false;
  private targetWalking = false;
  private targetWalkingBackward = false;
  private targetJumping = false;
  private targetCrouching = false;
  private targetShieldRecharging = false;
  private targetShieldRechargeEndAt = 0;
  private locomotionWalking = false;
  private locomotionWalkingBackward = false;
  private locomotionJumping = false;
  private locomotionCrouching = false;
  private crouchBlend = 0;
  private remoteDisplayedWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private readonly remoteWeaponBasePosition = new THREE.Vector3();
  private readonly remoteWeaponBaseRotation = new THREE.Euler();
  private readonly activeMeshBaseRotation = new THREE.Euler();
  private fireCooldown = 0;
  private localAutoFiring = false;
  private weaponSounds: WeaponSoundService | null = null;
  private projectileSpawnOptions: {
    canHitPlayers: boolean;
    ownerTeamId: number;
    ownerSessionId: string;
  } = { canHitPlayers: false, ownerTeamId: -1, ownerSessionId: '' };
  private teamId = 0;
  private alive = true;
  private remoteDeathActive = false;
  private remoteDeathHideAt = 0;
  private remoteDeathStartedAt = 0;
  private remoteDeathClipDurationSec = 2;
  private username = 'Player';
  private hp = 100;
  private shieldLevel = SHIELD_DEFAULT_LEVEL;
  private shieldPoints = getDefaultShieldPoints();
  private hitCapsuleDebug: THREE.Group | null = null;
  private bodyPartBones: BodyPartBones | null = null;

  private constructor(local: boolean) {
    this.loadout = new WeaponLoadout(DEFAULT_LOADOUT_CONFIGS, KATANA_CONFIG);

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

      if (!this.loadout.getActive()) {
        console.warn('[Player] No active weapon');
        return;
      }
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
      this.weaponPose.setViewConfig(this.loadout.getActive()!.config.view);
      this.weaponSway = new WeaponSway();
      this.katanaSlashFx = new KatanaSlashTrailFx();
      this.katanaSlashFx.attachToCamera(this.camera);
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

      this.meleeHitFx = new MeleeHitFx();
      this.object.add(this.meleeHitFx.object);

      this.shieldRechargeAuraFx = new ShieldRechargeAuraFx();
      this.object.add(this.shieldRechargeAuraFx.object);
    }
  }

  static createLocal(): Player {
    const player = new Player(true);
    player.setProjectileSpawnOptions(0);
    return player;
  }

  setMapCollisionDef(map: MapCollisionDef): void {
    this.mapCollisionDef = map;
  }

  static createRemote(_color = 0x6a9fd4): Player {
    return new Player(false);
  }

  static async preloadGameCharacterModels(): Promise<void> {
    await preloadGameCharacterModels();
  }

  async syncRemoteCharacterModel(worldTime: number): Promise<void> {
    if (this.camera) return;

    this.tickRemoteDeath();
    if (!this.alive) {
      if (this.remoteDeathActive && this.object.visible) {
        await this.ensureRemoteDeathModel();
        return;
      }
      this.object.visible = false;
      return;
    }

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

  private beginRemoteDeathSequence(): void {
    this.remoteDeathActive = true;
    this.remoteDeathHideAt = performance.now() / 1000 + REMOTE_DEATH_DISPLAY_SEC;
    this.object.visible = true;
    this.damageNumberStack?.clear();
    this.loadout?.setMeshesVisible(false);
    void this.ensureRemoteDeathModel();
  }

  private endRemoteDeathSequence(): void {
    this.remoteDeathActive = false;
    this.remoteDeathHideAt = 0;
    this.remoteDeathStartedAt = 0;
    this.object.visible = true;
    if (this.pitchPivot) {
      this.pitchPivot.position.y = 0;
    }
  }

  private tickRemoteDeath(): void {
    if (this.camera || this.alive || !this.remoteDeathActive) return;

    if (performance.now() / 1000 >= this.remoteDeathHideAt) {
      this.remoteDeathActive = false;
      this.object.visible = false;
    }
  }

  private async ensureRemoteDeathModel(): Promise<void> {
    if (this.camera || this.alive) return;
    if (this.displayedCharacterModelFile === CHARACTER_MODEL_FILES.death && this.characterInstance) {
      return;
    }

    const template = await loadDeathCharacterTemplate();
    this.setCharacterModel(template);
    this.loadout?.setMeshesVisible(false);
    this.remoteDeathStartedAt = performance.now() / 1000;
    this.remoteDeathClipDurationSec = Math.max(template.clipDurationSec, 0.5);
    if (this.pitchPivot) {
      this.pitchPivot.position.y = 0;
    }
    this.characterInstance?.update(0);
  }

  private getRemotePose(worldTime: number): RemoteCharacterPose {
    const { reloading } = getReloadState(
      this.targetReloadEndAt,
      worldTime,
      this.targetActiveWeaponId,
    );
    const weaponSwitch = getWeaponSwitchAnimState(this.targetWeaponSwitchEndAt, worldTime);
    const meleeAttack = getMeleeAttackAnimState(this.targetMeleeAttackEndAt, worldTime);

    if (
      this.displayedCharacterModelFile === CHARACTER_MODEL_FILES.meleeAttack &&
      (this.characterInstance?.isOneShotFinished ?? false)
    ) {
      this.meleeAttackAnimConsumed = true;
    }
    if (
      this.displayedCharacterModelFile === CHARACTER_MODEL_FILES.weaponEquip &&
      (this.characterInstance?.isOneShotFinished ?? false)
    ) {
      this.weaponSwitchAnimConsumed = true;
    }

    return {
      sprinting: this.targetSprinting,
      walking: this.targetWalking,
      walkingBackward: this.targetWalkingBackward,
      jumping: this.targetJumping,
      crouching: this.targetCrouching,
      reloading,
      switchingWeapon: weaponSwitch.active && !this.weaponSwitchAnimConsumed,
      meleeAttacking:
        meleeAttack.active &&
        this.targetActiveWeaponId === MELEE_WEAPON_ID &&
        !this.meleeAttackAnimConsumed,
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
    this.bodyPartBones = resolveBodyPartBones(this.characterInstance.root);
    this.bindRemoteCharacterRig(template);
    this.refreshRemoteUiTopOffset();
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

    this.syncRemoteKatanaAxisDebug();
  }

  private syncRemoteKatanaAxisDebug(): void {
    this.remoteKatanaAxisDebug?.dispose();
    this.remoteKatanaAxisDebug = null;
    if (this.camera || !this.loadout) return;

    const katanaMesh = this.loadout.getMeleeWeaponMesh();
    if (!katanaMesh) return;

    this.remoteKatanaAxisDebug = attachAxisDebugArrowsIfEnabled(katanaMesh, {
      length: 5,
    });
  }

  private refreshRemoteWeaponMount(modelFile: string): void {
    if (!this.loadout) return;

    const weaponId = this.loadout.getActiveWeaponId();
    if (!weaponId) return;

    this.remoteWeaponMount = getRemoteWeaponMount(modelFile, weaponId);
    this.remoteWeaponBasePosition.copy(this.remoteWeaponMount.weaponPosition);
    this.remoteWeaponBaseRotation.copy(this.remoteWeaponMount.weaponRotation);
  }

  attachToScene(scene: THREE.Scene): void {
    scene.add(this.object);
    if (isHitCapsuleDebugEnabled() && !this.camera) {
      this.hitCapsuleDebug = createHitCapsuleDebugMesh();
      (this.bodyRoot ?? this.object).add(this.hitCapsuleDebug);
    }
  }

  bindAimControls(controls: PointerAimControls): void {
    this.aimControls = controls;
  }

  getSprintState(): SprintState {
    return this.sprint.getState();
  }

  getLocomotionState(): {
    isSprinting: boolean;
    isWalking: boolean;
    isWalkingBackward: boolean;
    isJumping: boolean;
    isCrouching: boolean;
  } {
    if (this.camera) {
      return {
        isSprinting: this.sprint.getState().isSprinting,
        isWalking: this.locomotionWalking,
        isWalkingBackward: this.locomotionWalkingBackward,
        isJumping: !this.physics.grounded,
        isCrouching: this.locomotionCrouching,
      };
    }

    return {
      isSprinting: this.targetSprinting,
      isWalking: this.targetWalking,
      isWalkingBackward: this.targetWalkingBackward,
      isJumping: this.targetJumping,
      isCrouching: this.targetCrouching,
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
    const meleeEquipped = this.loadout.isMeleeEquipped();
    return Array.from({ length: LOADOUT_SIZE }, (_, slotIndex) => {
      const weaponId = this.loadout!.getSlotWeaponId(slotIndex);
      const occupied = weaponId !== null;
      return {
        slotIndex,
        weaponId,
        name: occupied ? (getWeaponConfig(weaponId)!.name) : 'Empty',
        active: occupied && !meleeEquipped && slotIndex === activeIndex,
        occupied,
      };
    });
  }

  getInventoryMelee(): InventoryMeleeEntry {
    return {
      name: KATANA_CONFIG.name,
      active: this.loadout?.isMeleeEquipped() ?? false,
    };
  }

  applyLoadoutFromSnapshot(snapshot: PlayerSnapshot): void {
    if (!this.loadout || !this.camera) return;

    this.loadout.applyServerSlots(snapshot, snapshot.activeWeaponId);
    if (isWeaponId(snapshot.activeWeaponId)) {
      this.targetActiveWeaponId = snapshot.activeWeaponId;
      this.loadout.setRemoteActiveWeapon(snapshot.activeWeaponId);
      const active = this.loadout.getActive();
      if (active) this.weaponPose?.setViewConfig(active.config.view);
    } else {
      this.stopWeaponAutoFire();
    }
  }

  applyEmptyLoadout(): void {
    if (!this.loadout) return;

    this.loadout.applyServerSlots(
      {
        weaponSlot0: EMPTY_WEAPON_SLOT,
        weaponSlot1: EMPTY_WEAPON_SLOT,
        weaponSlot2: EMPTY_WEAPON_SLOT,
      },
      EMPTY_WEAPON_SLOT,
    );
    this.stopWeaponAutoFire();
  }

  getAdsBlend(): number {
    return this.weaponPose?.adsBlend ?? 0;
  }

  getActiveWeaponId(): WeaponId | null {
    return this.loadout?.getActiveWeaponId() ?? null;
  }

  getActiveDamage(): number {
    return this.loadout?.getActiveDamage() ?? 0;
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

  setAutoFireStopCallback(callback: AutoFireStopCallback | null): void {
    this.onAutoFireStopNetwork = callback;
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

  setMeleeEquipNetworkCallback(callback: MeleeEquipCallback | null): void {
    this.onMeleeEquipNetwork = callback;
  }

  setMeleeAttackNetworkCallback(callback: MeleeAttackNetworkCallback | null): void {
    this.onMeleeAttackNetwork = callback;
  }

  setShieldRechargeNetworkCallback(callback: ShieldRechargeNetworkCallback | null): void {
    this.onShieldRechargeNetwork = callback;
  }

  setShieldDomeAbility(ability: ShieldDomeAbility | null): void {
    this.shieldDomeAbility = ability;
  }

  setShieldDomeWorldTimeProvider(provider: (() => number) | null): void {
    this.shieldDomeWorldTime = provider;
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

  getShieldLevel(): number {
    return this.shieldLevel;
  }

  getShieldPoints(): number {
    return this.shieldPoints;
  }

  getShieldRecharging(): boolean {
    return this.targetShieldRecharging;
  }

  getShieldRechargeEndAt(): number {
    return this.targetShieldRechargeEndAt;
  }

  updateCrosshairAim(hud: CrosshairHud, width: number, height: number): void {
    if (!this.camera || !this.loadout) {
      hud.setAimOffset(0, 0);
      return;
    }

    const active = this.loadout.getActive();
    if (!active) {
      hud.setAimOffset(0, 0);
      return;
    }

    projectMuzzleAimToScreenOffset(
      active.mesh,
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

  getAimYaw(): number {
    return this.currentYaw;
  }

  getAimPitch(): number {
    return this.currentPitch;
  }

  /** Bone-driven world-space hit capsules (updated each remote frame). */
  getBodyHitVolumes(): BodyPartVolume[] | null {
    if (!this.bodyPartBones || !this.characterInstance) return null;
    this.characterInstance.update(0);
    this.object.updateMatrixWorld(true);
    const boneRefs = readBodyPartBoneRefsWorld(this.bodyPartBones);
    return bodyPartVolumesFromBoneRefs(boneRefs);
  }

  /** Third-person active weapon muzzle in world space (remote observers). */
  readActiveMuzzleWorldPosition(position: THREE.Vector3, weaponId?: WeaponId): boolean {
    if (!this.loadout || this.camera) return false;

    let mesh = this.loadout.getActive()?.mesh;
    if (weaponId) {
      for (let i = 0; i < LOADOUT_SIZE; i++) {
        const slot = this.loadout.getSlot(i);
        if (slot?.config.id === weaponId) {
          mesh = slot.mesh;
          break;
        }
      }
    }

    if (!mesh) return false;

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
    this.crouchBlend = 0;
    this.locomotionCrouching = false;
    if (this.pitchRig) {
      this.pitchRig.position.y = EYE_HEIGHT;
    }
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
    const active = this.loadout?.getActive();
    if (active) {
      this.weaponPose?.setViewConfig(active.config.view);
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
    this.targetPosition.set(
      snapshot.x,
      feetYFromNetworkEyeY(snapshot.y, snapshot.crouching),
      snapshot.z,
    );
    this.targetYaw = snapshot.yaw;
    this.targetPitch = snapshot.pitch;
    this.targetReloadEndAt = snapshot.reloadEndAt;
    if (snapshot.weaponSwitchEndAt !== this.targetWeaponSwitchEndAt) {
      this.weaponSwitchAnimConsumed = false;
    }
    if (snapshot.meleeAttackEndAt !== this.targetMeleeAttackEndAt) {
      this.meleeAttackAnimConsumed = false;
    }
    this.targetWeaponSwitchEndAt = snapshot.weaponSwitchEndAt;
    this.targetMeleeAttackEndAt = snapshot.meleeAttackEndAt;
    if (isWeaponId(snapshot.activeWeaponId)) {
      this.targetActiveWeaponId = snapshot.activeWeaponId;
      this.loadout?.setRemoteActiveWeapon(snapshot.activeWeaponId);
    }
    this.targetSprinting = snapshot.sprinting;
    this.targetWalking = snapshot.walking;
    this.targetWalkingBackward = snapshot.walkingBackward;
    this.targetJumping = snapshot.jumping;
    this.targetCrouching = snapshot.crouching;
    this.targetShieldRecharging = snapshot.shieldRecharging;
    this.targetShieldRechargeEndAt = snapshot.shieldRechargeEndAt;
    this.teamId = snapshot.teamId;
    const wasAlive = this.alive;
    this.alive = snapshot.alive;
    this.username = snapshot.username;

    if (!this.camera) {
      if (wasAlive && !snapshot.alive) {
        this.beginRemoteDeathSequence();
      } else if (!wasAlive && snapshot.alive) {
        this.endRemoteDeathSequence();
      }

      if (snapshot.alive) {
        const hpLoss = Math.max(0, this.hp - snapshot.hp);
        const shieldLoss = Math.max(0, this.shieldPoints - snapshot.shieldPoints);
        const totalDamage = Math.floor(hpLoss + shieldLoss);
        if (totalDamage > 0) {
          this.showDamageNumber(totalDamage);
        }
        if (this.shieldPoints > 0 && snapshot.shieldPoints <= 0) {
          this.playShieldBreakFx();
          this.onShieldBreakListener?.();
        }
      }

      this.remoteHealthBar?.update(snapshot.hp, snapshot.alive, snapshot.teamId, snapshot.username);
    }

    this.hp = snapshot.hp;
    this.shieldLevel = snapshot.shieldLevel;
    this.shieldPoints = snapshot.shieldPoints;
    if (this.camera) {
      this.inventory.setShieldCharges(snapshot.shieldCharges);
    } else if (this.loadout) {
      this.loadout.applyServerSlots(snapshot, snapshot.activeWeaponId);
      if (isWeaponId(snapshot.activeWeaponId)) {
        this.loadout.setRemoteActiveWeapon(snapshot.activeWeaponId);
        this.targetActiveWeaponId = snapshot.activeWeaponId;
      }
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

    this.tickRemoteDeath();
    this.applyRemoteDeathDrop();

    const t = 1 - Math.exp(-REMOTE_INTERPOLATION_SPEED * delta);
    this.object.position.lerp(this.targetPosition, t);
    const aim = aimDirectionFromYawPitch(this.currentYaw, this.currentPitch);
    const cleared = applyForwardLimbWallClearance(
      getClientPhysicsWorld(),
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      aim.x,
      aim.z,
      this.targetCrouching,
    );
    this.object.position.x = cleared.x;
    this.object.position.z = cleared.z;
    this.currentYaw = lerpAngle(this.currentYaw, this.targetYaw, t);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, t);
    this.applyRemoteAim();
    this.characterInstance?.update(delta);
    this.applyRemoteSpinePitch();
    this.syncHitCapsuleDebug();
  }

  private syncHitCapsuleDebug(): void {
    if (!this.hitCapsuleDebug) return;

    const space = this.bodyRoot ?? this.object;
    const volumes = this.getBodyHitVolumes();
    updateHitCapsuleDebugMesh(this.hitCapsuleDebug, volumes, space);
  }

  updateRemoteHealthBar(
    camera: THREE.Camera,
    visibility: RemotePlayerUiVisibilityState,
  ): void {
    this.syncRemoteUiHeight();
    this.remoteHealthBar?.setVisibility(visibility);
    this.remoteHealthBar?.updateLayout(camera);
  }

  private syncRemoteUiHeight(): void {
    if (!this.remoteHealthBar) return;

    this.remoteHealthBar.setHeadTopOffset(this.remoteHeadTopOffset);
    this.damageNumberStack?.setHeadTopOffset(
      (this.remoteHeadTopOffset + 0.16) * DAMAGE_NUMBER_HEIGHT_SCALE,
    );
  }

  private refreshRemoteUiTopOffset(): void {
    if (!this.characterInstance) {
      this.remoteHeadTopOffset = EYE_HEIGHT + 0.38;
      return;
    }

    this.remoteHeadTopOffset = computeTopOffsetAboveFeet(
      this.characterInstance.root,
      this.object,
      0.38,
    );
  }

  showDamageNumber(amount: number): void {
    this.damageNumberStack?.push(amount);
  }

  playMeleeHitFx(worldPoint: THREE.Vector3): void {
    if (!this.meleeHitFx || this.camera) return;

    const local = this.object.worldToLocal(worldPoint.clone());
    this.meleeHitFx.play(local);
  }

  setShieldBreakListener(listener: (() => void) | null): void {
    this.onShieldBreakListener = listener;
  }

  private playShieldBreakFx(): void {
    if (this.camera) return;
    if (!this.shieldBreakFx) {
      this.shieldBreakFx = new ShieldBreakFx();
      this.object.add(this.shieldBreakFx.object);
    }
    this.shieldBreakFx.play();
  }

  updateDamageNumbers(delta: number, camera: THREE.Camera): void {
    this.damageNumberStack?.update(delta, camera);
    if (this.shieldBreakFx) {
      if (!this.shieldBreakFx.update(delta, camera)) {
        this.shieldBreakFx.dispose();
        this.shieldBreakFx = null;
      }
    }
    this.meleeHitFx?.update(delta, camera);
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
    if (!this.alive || this.remoteDeathActive) return;

    const pose = this.getRemotePose(worldTime);
    this.loadout.setMeshesVisible(!pose.switchingWeapon);

    const weaponChanged = this.targetActiveWeaponId !== this.remoteDisplayedWeaponId;
    if (weaponChanged && isWeaponId(this.targetActiveWeaponId)) {
      this.loadout.setRemoteActiveWeapon(this.targetActiveWeaponId);
      this.remoteDisplayedWeaponId = this.targetActiveWeaponId;
      const active = this.loadout.getActive();
      if (active) {
        this.weaponPose.setViewConfig(active.config.view);
        this.weaponPose.startSwitch(this.loadout.getSwitchReadySec());
      }
      if (this.displayedCharacterModelFile) {
        this.refreshRemoteWeaponMount(this.displayedCharacterModelFile);
      }
    }

    if (!this.remoteWeaponMount) return;

    const active = this.loadout.getActive();
    if (!active) return;
    this.remoteWeaponBasePosition.copy(this.remoteWeaponMount.weaponPosition);
    const aim = aimDirectionFromYawPitch(this.currentYaw, this.currentPitch);
    const limbFactor = measureForwardLimbClearanceFactor(
      getClientPhysicsWorld(),
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      aim.x,
      aim.y,
      aim.z,
      this.targetCrouching,
    );
    this.remoteWeaponBasePosition.multiplyScalar(limbFactor);
    const remoteBaseRotation = getRemoteWeaponBaseRotation(
      active.config,
      this.remoteWeaponMount.weaponRotation,
    );
    resolveWeaponMeshRotation(
      remoteBaseRotation,
      active.config.view,
      'remote',
      this.remoteWeaponBaseRotation,
    );
    this.loadout.applyActiveRotation(remoteBaseRotation, 'remote');
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

    this.katanaSlashFx?.update(delta);

    if (!canAct) {
      this.stopWeaponAutoFire();
      this.headBob.update(delta, false, false);
      if (this.headRig) this.headBob.apply(this.headRig, false);
      if (this.aimControls) this.aimControls.pointerSpeed = 1;
      return;
    }

    this.trySwitchWeapon(input);
    this.tryToggleMeleeEquip(input);

    const wantsCrouch = input.isPressed('KeyC');
    const isCrouching = wantsCrouch && this.physics.grounded;

    const wantsSprint =
      !wantsCrouch &&
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
    const isWalkingBackward =
      isWalking && input.isPressed('KeyS') && !input.isPressed('KeyW');
    this.locomotionWalking = isWalking;
    this.locomotionWalkingBackward = isWalkingBackward;

    this.loadout.update(delta);

    const active = this.loadout.getActive();
    const meleeEquipped = this.loadout.isMeleeEquipped();
    let shooting = false;
    let ammoReloading = false;
    let ammoReloadProgress = 0;
    let ads = false;

    if (active) {
      if (input.isJustPressed('KeyR')) {
        if (
          !meleeEquipped &&
          this.loadout.isWeaponReady() &&
          !this.weaponPose?.isSwitching() &&
          active.ammo.tryReload()
        ) {
          this.weaponSounds?.playReload(active.config.sounds);
          const weaponId = this.loadout.getActiveWeaponId();
          if (weaponId) this.onReloadNetwork?.(weaponId);
        }
      }

      this.tryStartShieldRecharge(input);

      ads = !meleeEquipped && pointer.isPressed(POINTER_ADS);
      const ammoState = active.ammo.getState();
      ammoReloading = ammoState.reloading;
      ammoReloadProgress = ammoState.reloadProgress;
      if (ammoState.reloading) {
        this.stopWeaponAutoFire();
      }
      shooting =
        active.config.fireMode === 'melee'
          ? this.weaponPose?.isSlashing() ?? false
          : this.isFiring(pointer, active.config.fireMode);

      this.weaponPose?.setViewConfig(active.config.view);
      this.weaponPose?.update(
        delta,
        ads,
        ammoState.reloading,
        ammoState.reloadProgress,
        { ignoreAds: meleeEquipped },
      );
      if (this.aimControls) {
        const adsLookSensitivity = active.config.view.adsLookSensitivity ?? 1;
        const adsBlend = meleeEquipped ? 0 : (this.weaponPose?.adsBlend ?? 0);
        this.aimControls.pointerSpeed = THREE.MathUtils.lerp(1, adsLookSensitivity, adsBlend);
      }
      this.weaponSway?.update(
        delta,
        isWalking,
        isSprinting,
        shooting,
        this.physics.grounded,
        meleeEquipped ? 0 : (this.weaponPose?.adsBlend ?? 0),
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
      this.updateMeleeAttack(delta, input, pointer, projectiles);
    } else {
      this.stopWeaponAutoFire();
      this.tryStartShieldRecharge(input);
      if (this.aimControls) this.aimControls.pointerSpeed = 1;
    }

    const moveMultiplier =
      active && meleeEquipped && isSprinting
        ? (active.config.moveSpeedMultiplier ?? KATANA_CONFIG.moveSpeedMultiplier ?? 1)
        : isCrouching
          ? CROUCH_SPEED_MULTIPLIER
          : 1;
    const speed = MOVE_SPEED * moveMultiplier * delta;

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

    const jump = !wantsCrouch && input.isJustPressed('Space');
    const wasGrounded = this.physics.grounded;
    const result = stepPlayerPhysicsClient(
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      this.physics,
      deltaX,
      deltaZ,
      jump,
      delta,
      this.mapCollisionDef,
    );

    this.object.position.set(result.x, result.y, result.z);
    this.physics = result.state;

    if (jump && wasGrounded) {
      this.locomotionJumping = true;
    }
    if (this.physics.grounded) {
      this.locomotionJumping = false;
    }

    this.locomotionCrouching = wantsCrouch && this.physics.grounded;
    this.crouchBlend = THREE.MathUtils.damp(
      this.crouchBlend,
      this.locomotionCrouching ? 1 : 0,
      CROUCH_CAMERA_BLEND_SPEED,
      delta,
    );
    if (this.pitchRig) {
      this.pitchRig.position.y = EYE_HEIGHT - this.crouchBlend * CROUCH_EYE_DROP;
    }

    const cleared = applyForwardLimbWallClearance(
      getClientPhysicsWorld(),
      this.object.position.x,
      this.object.position.y,
      this.object.position.z,
      this.forward.x,
      this.forward.z,
      this.locomotionCrouching,
    );
    this.object.position.x = cleared.x;
    this.object.position.z = cleared.z;

    this.tryDeployShieldDome(input, {
      isSprinting,
      isJumping: !this.physics.grounded,
      grounded: this.physics.grounded,
      shooting,
      reloading: ammoReloading,
      ads,
    });

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
    this.meleeHitFx?.dispose();
    this.meleeHitFx = null;
    this.shieldRechargeAuraFx?.dispose();
    this.shieldRechargeAuraFx = null;
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.displayedCharacterModelFile = null;
    this.remoteWeaponMount = null;
    this.remoteKatanaAxisDebug?.dispose();
    this.remoteKatanaAxisDebug = null;
    this.handRig = null;
    this.spineBone = null;
    this.lookRigFollowsHead = false;
    this.loadout?.dispose();
    this.loadout = null;
    this.katanaSlashFx?.dispose();
    this.katanaSlashFx = null;
    this.hitCapsuleDebug = null;
    this.bodyPartBones = null;
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.object.removeFromParent();
  }

  private tryToggleMeleeEquip(input: KeyboardInput): void {
    if (!this.loadout || !input.isJustPressed('KeyX')) return;

    const equip = !this.loadout.isMeleeEquipped();
    if (!this.loadout.tryEquipMelee(equip)) return;

    this.stopWeaponAutoFire();
    const active = this.loadout.getActive();
    if (!active) return;

    this.weaponPose?.setViewConfig(active.config.view);
    this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
    this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    this.onMeleeEquipNetwork?.(equip);
  }

  private trySwitchWeapon(input: KeyboardInput): void {
    if (!this.loadout) return;

    for (let slot = 0; slot < LOADOUT_SIZE; slot++) {
      const code = `Digit${slot + 1}`;
      if (!input.isJustPressed(code)) continue;
      if (!this.loadout.trySwitch(slot)) continue;

      this.stopWeaponAutoFire();
      const active = this.loadout.getActive();
      if (!active) continue;

      this.weaponPose?.setViewConfig(active.config.view);
      this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
      this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
      const weaponId = this.loadout.getActiveWeaponId();
      if (weaponId) this.onWeaponSwitchNetwork?.(slot, weaponId);
      break;
    }
  }

  private tryStartShieldRecharge(input: KeyboardInput): void {
    if (!input.isJustPressed('Digit4')) return;
    this.onShieldRechargeNetwork?.();
  }

  private tryDeployShieldDome(
    input: KeyboardInput,
    context: {
      isSprinting: boolean;
      isJumping: boolean;
      grounded: boolean;
      shooting: boolean;
      reloading: boolean;
      ads: boolean;
    },
  ): void {
    if (!this.shieldDomeAbility) return;

    this.shieldDomeAbility.tryActivate(
      input.isJustPressed(ShieldDomeAbility.activateKey),
      context,
      this.shieldDomeWorldTime?.() ?? 0,
    );
  }

  private isFiring(pointer: PointerInput, fireMode: WeaponFireMode): boolean {
    if (fireMode === 'melee') return false;
    return fireMode === 'semi'
      ? pointer.isJustPressed(POINTER_SHOOT)
      : pointer.isPressed(POINTER_SHOOT);
  }

  private updateMeleeAttack(
    delta: number,
    input: KeyboardInput,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!this.loadout?.isMeleeEquipped() || !this.camera) return;

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);

    const wantsAttack =
      pointer.isJustPressed(POINTER_SHOOT) || input.isJustPressed('KeyV');
    if (!wantsAttack) return;

    if (!this.loadout.isWeaponReady() || this.weaponPose?.isSwitching()) return;
    if (this.fireCooldown > 0 || this.weaponPose?.isSlashing()) return;

    const active = this.loadout.getActive();
    if (!active || !active.ammo.tryShoot()) return;

    this.weaponSounds?.playSingleShot(active.config.sounds);
    this.weaponPose?.startSlash(KATANA_SLASH_DURATION_SEC);
    this.katanaSlashFx?.play(active.mesh);
    this.fireCooldown += active.fireInterval;
    this.onMeleeAttackNetwork?.();

    if (projectiles) {
      projectiles.tryMeleeHit(
        this.camera,
        active.config.meleeRange ?? 2.8,
        this.projectileSpawnOptions.ownerSessionId,
      );
    }
  }

  private updateFire(
    delta: number,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!this.loadout) return;

    const active = this.loadout.getActive();
    if (!active || active.config.fireMode === 'melee') return;

    if (!pointer.isPressed(POINTER_SHOOT)) {
      this.stopWeaponAutoFire();
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);

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

  private stopWeaponAutoFire(): void {
    const wasAutoFiring = this.localAutoFiring;
    this.localAutoFiring = false;
    this.weaponSounds?.stopAutoFire();
    if (wasAutoFiring) {
      this.onAutoFireStopNetwork?.();
    }
  }

  private shoot(projectiles: ProjectileManager | null): boolean {
    if (!this.camera || !this.loadout || !projectiles) return false;

    const active = this.loadout.getActive();
    if (!active || !active.ammo.tryShoot()) {
      this.stopWeaponAutoFire();
      return false;
    }

    if (active.config.fireMode === 'auto') {
      this.localAutoFiring = true;
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

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    projectMuzzleAimToScreenOffset(
      active.mesh,
      this.camera,
      viewportWidth,
      viewportHeight,
      _crosshairAimOffset,
    );
    readCrosshairWorldRay(
      this.camera,
      viewportWidth,
      viewportHeight,
      _crosshairAimOffset.x,
      _crosshairAimOffset.y,
      this.hitRayOrigin,
      this.hitRayDirection,
    );

    const feet = this.object.position;
    projectiles.spawn(
      {
        hitRayOrigin: this.hitRayOrigin,
        hitRayDirection: this.hitRayDirection,
        visualOrigin: this.muzzleOrigin,
        speed: active.config.projectileSpeed,
      },
      {
      ...this.projectileSpawnOptions,
      shooterId: this.projectileSpawnOptions.ownerSessionId || undefined,
      shooterWorldPos: new THREE.Vector3(
        feet.x,
        feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5,
        feet.z,
      ),
      muzzleFlash: active.config.muzzleFlash,
      boltColors: active.config.muzzleFlash?.colors,
      },
    );
    this.onShoot?.(this.muzzleOrigin, this.aimDirection);
    return true;
  }

  private getActiveRecoil() {
    return this.loadout?.getActive()?.recoil ?? null;
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

    const active = this.loadout.getActive();
    if (!active) return;

    let wallPullback = 0;
    if (this.camera) {
      const physics = getClientPhysicsWorld();
      if (physics?.isReady) {
        this.camera.getWorldPosition(this.muzzleOrigin);
        this.camera.getWorldDirection(this.aimDirection);
        const reach = Math.abs(this.weaponPose?.hipOffset.z ?? 0.35) + 0.3;
        wallPullback = measureViewWeaponWallPullback(
          physics,
          this.muzzleOrigin.x,
          this.muzzleOrigin.y,
          this.muzzleOrigin.z,
          this.aimDirection.x,
          this.aimDirection.y,
          this.aimDirection.z,
          reach,
        );
      }
    }

    this.weaponPose?.apply(active.mesh, wallPullback);
  }

  private getActiveMeshBaseRotation(): THREE.Euler {
    const active = this.loadout?.getActive();
    if (!active) return this.activeMeshBaseRotation;

    return resolveWeaponMeshRotation(
      getLocalWeaponBaseRotation(active.config),
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
    if (!this.spineBone || this.remoteDeathActive) return;
    // One-shot clips clamp on the last frame; the mixer may stop driving the spine
    // bone while this pose is still displayed — skip pitch to avoid quaternion drift.
    if (this.characterInstance?.isOneShotFinished) return;

    _spinePitchQuat.setFromAxisAngle(_spinePitchAxis, -this.currentPitch);
    this.spineBone.quaternion.multiply(_spinePitchQuat);
  }

  private applyRemoteDeathDrop(): void {
    if (!this.pitchPivot || !this.remoteDeathActive || this.alive) return;

    const elapsed = performance.now() / 1000 - this.remoteDeathStartedAt;
    const t = THREE.MathUtils.clamp(elapsed / this.remoteDeathClipDurationSec, 0, 1);
    const eased = t * t * (3 - 2 * t);
    this.pitchPivot.position.y = -REMOTE_DEATH_GROUND_DROP * eased;
  }
}
