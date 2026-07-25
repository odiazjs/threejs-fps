import * as THREE from 'three';
import { EYE_HEIGHT, type PlayerPhysicsState } from '../../shared/level/collision';
import { stepPlayerPhysicsClient } from './levelMovement';
import { DEFAULT_MAP_ID, getClientMapDef, getMapDef, type MapCollisionDef } from '../../shared/level/maps';
import {
  computeGrenadeThrowVelocity,
  predictGrenadeArcPreview,
  type GrenadeArcPreviewResult,
} from '../../shared/combat/grenadePhysics';
import type { GrenadeThrowRequest } from '../../shared/network/grenade';
import {
  GRENADE_COOK_HOLD_GRACE_SEC,
  GRENADE_FUSE_SEC,
  GRENADE_THROW_ARM_DEPTH,
  GRENADE_THROW_SCREEN_OFFSET_X,
  GRENADE_THROW_SCREEN_OFFSET_Y,
} from '../../shared/throwables/grenadeConfig';
import { GrenadeViewModel } from './GrenadeViewModel';
import { FpArmsViewModel } from './FpArmsViewModel';
import { getWeaponConfig, PICKABLE_WEAPON_CONFIGS, KATANA_CONFIG } from '../content/weaponConfig';
import type { WeaponEffectiveStats } from '../../shared/content/weaponUpgrades';
import {
  isPickableWeaponId,
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
import {
  MELEE_IMPACT_PROGRESS_END,
  MELEE_IMPACT_PROGRESS_START,
} from '../../shared/combat/meleeHit';
import { bodyPartVolumesFromBoneRefs, type BodyPartVolume } from '../../shared/combat/bodyPartVolumes';
import { WeaponLoadout, type LoadoutAmmoState, resolveWeaponMeshRotation, getLocalWeaponBaseRotation, getRemoteWeaponBaseRotation } from '../combat/WeaponLoadout';
import {
  alignDigitalSightToCrosshair,
  applyDigitalSightStyle,
  updateDigitalSightAdsVisibility,
} from '../combat/DigitalSight';
import {
  getEquippedSightForWeapon,
  weaponHasDigitalSight,
} from '../content/equippedWeaponSights';
import {
  digitalSightStyleFromEntry,
  getDigitalSightCatalogEntry,
} from '../content/digitalWeaponSights';
import {
  syncPhysicalSightOnWeapon,
  weaponUsesPhysicalSights,
} from '../content/physicalWeaponSights';
import { ScopeLens } from '../combat/ScopeLens';
import { readCrosshairWorldRay, readWeaponMuzzleWorldPosition, readWeaponSideVentFlashOffsets, readScreenHoldWorldPosition } from '../combat/aiming';
import { readPelletDirection } from '../combat/pelletSpread';
import type { KeyboardInput } from '../input/KeyboardInput';
import { POINTER_ADS, POINTER_SHOOT, type PointerInput } from '../input/PointerInput';
import type { PlayerSnapshot } from '../network/types';
import { DEFAULT_OPERATOR_CHARACTER_ID } from '../../shared/content/characters';
import { DEFAULT_CHARACTER_ITEM_ID } from '../../shared/content/storeItemTypes';
import { getCharacterMeshFile } from '../content/activeCharacterMesh';
import { EMPTY_WEAPON_SLOT } from '../../shared/loadout/loadoutSlots';
import { SPRINT_MULTIPLIER, SprintStamina, type SprintState } from './SprintStamina';
import {
  LAND_SLIDE_GRACE_SEC,
  SlideController,
  SPRINT_CHARGE_FULL_SEC,
} from './SlideController';
import { GrenadeThrowKick } from './GrenadeThrowKick';
import { ExplosionCameraShake } from './ExplosionCameraShake';
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
import { resolveFaceLookParent } from './characterFace';
import { getRemoteWeaponMount, type RemoteWeaponMount } from './remoteWeaponMount';
import { RemoteHealthBar } from './RemoteHealthBar';
import type { RemotePlayerUiVisibilityState } from './remotePlayerUiVisibility';
import { DamageNumberStack } from '../ui/DamageNumberStack';
import { MeleeHitFx } from '../effects/MeleeHitFx';
import { ShieldRechargeAuraFx } from '../effects/ShieldRechargeAuraFx';
import { applyLookPitch, applyLookYaw, applyPlayerAim, readWorldPlayerAim, AIM_PITCH_LIMIT } from './playerAim';
import type { PointerAimControls } from './PointerAimControls';
import { WeaponPose } from './WeaponPose';
import { WeaponSwaySystem } from '../gunfeel/WeaponSwaySystem';
import { GunJuice } from '../gunfeel/GunJuice';
import { KatanaSlashTrailFx, KATANA_SLASH_DURATION_SEC } from '../effects/KatanaSlashTrailFx';
import { createHitCapsuleDebugMesh, isHitCapsuleDebugEnabled, updateHitCapsuleDebugMesh } from '../combat/HitCapsuleDebugMesh';
import {
  attachAxisDebugArrowsIfEnabled,
  type AxisDebugArrows,
} from '../debug/AxisDebugArrows';
import type { CrosshairHud } from '../ui/CrosshairHud';
import type { WeaponSoundService } from '../audio/WeaponSoundService';
import type { GrenadeSoundService } from '../audio/GrenadeSoundService';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import { getReloadState } from '../../shared/combat/reload';
import {
  getMeleeAttackAnimState,
  getWeaponSwitchAnimState,
  REMOTE_DEATH_DISPLAY_SEC,
  REMOTE_DEATH_GROUND_DROP,
} from '../../shared/combat/characterAnim';
import {
  getDefaultShieldPoints,
  getShieldCapacity,
  SHIELD_DEFAULT_LEVEL,
} from '../../shared/combat/shield';
import { EnemyOutlineFx } from '../effects/EnemyOutlineFx';
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
/** Gap between the top of the character mesh and the nameplate anchor. */
const REMOTE_UI_HEAD_CLEARANCE = 0.12;
const MOVE_SPEED = 3;
const CROUCH_CAMERA_BLEND_SPEED = 12;
const REMOTE_INTERPOLATION_SPEED = 12;
const LOCAL_WEAPON_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0);

const _spinePitchAxis = new THREE.Vector3(1, 0, 0);
const _spinePitchQuat = new THREE.Quaternion();

function lerpAngle(from: number, to: number, t: number): number {
  const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * t;
}

export type ShootCallback = (
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  options?: { pelletIndex?: number },
) => void;
export type AutoFireStopCallback = () => void;
export type WeaponSwitchCallback = (slot: number, weaponId: WeaponId) => void;
export type MeleeEquipCallback = (equipped: boolean) => void;
export type MeleeAttackNetworkCallback = () => void;
export type ReloadNetworkCallback = (weaponId: WeaponId, durationSec?: number) => void;
export type ReloadStopNetworkCallback = () => void;
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
  /** Armory effective stats cached for this match (re-applied after loadout sync). */
  private matchWeaponStatsById: ReadonlyMap<string, WeaponEffectiveStats> | null = null;
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
  private readonly slide = new SlideController();
  private locomotionSliding = false;
  /** After landing, briefly allow C-slide without sprint. */
  private landSlideGraceSec = 0;
  /** Continuous grounded sprint time — feeds slide power (capped). */
  private sprintChargeSec = 0;
  /** Sprint charge frozen at jump takeoff for land-slides. */
  private airborneSlideChargeSec = 0;
  private headBob = new HeadBob();
  /** Consumed by weapon sway next frame (sway runs before physics). */
  private pendingSwayJump = false;
  private pendingSwayLand = false;
  private readonly grenadeThrowKick = new GrenadeThrowKick();
  private readonly explosionCameraShake = new ExplosionCameraShake();
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
  private displayedCharacterMeshFile: string | null = null;
  private displayedCharacterSkinId: string | null = null;
  private displayedOperatorId: string | null = null;
  /** Per-player store body skin id from the server (remotes only). */
  private remoteSelectedCharacterId = DEFAULT_CHARACTER_ITEM_ID;
  /** Per-player operator character id (face + perk) from the server (remotes only). */
  private remoteSelectedOperatorId = DEFAULT_OPERATOR_CHARACTER_ID;
  private meleeAttackAnimConsumed = false;
  private meleeHitResolved = false;
  private weaponSwitchAnimConsumed = false;
  private remoteWeaponMount: RemoteWeaponMount | null = null;
  private remoteKatanaAxisDebug: AxisDebugArrows | null = null;
  private remoteHealthBar: RemoteHealthBar | null = null;
  private remoteHeadTopOffset = EYE_HEIGHT + REMOTE_UI_HEAD_CLEARANCE;
  private enemyOutline: EnemyOutlineFx | null = null;
  private enemyHighlighted = false;
  /** Model file currently being loaded async — dedupes per-frame sync calls. */
  private remoteModelLoadingFile: string | null = null;
  private damageNumberStack: DamageNumberStack | null = null;
  private meleeHitFx: MeleeHitFx | null = null;
  private shieldRechargeAuraFx: ShieldRechargeAuraFx | null = null;
  private onShieldBreakListener: (() => void) | null = null;
  private muzzleOrigin = new THREE.Vector3();
  private readonly sideVentOffsets: THREE.Vector3[] = [];
  private aimDirection = new THREE.Vector3();
  private hitRayOrigin = new THREE.Vector3();
  private readonly shooterWorldPos = new THREE.Vector3();
  private hitRayDirection = new THREE.Vector3();
  private readonly pelletDirection = new THREE.Vector3();
  private weaponPose: WeaponPose | null = null;
  private weaponSway: WeaponSwaySystem | null = null;
  /** Sniper optic glass — zoomed world view on `scope_camera_decal`. */
  private readonly scopeLens = new ScopeLens();
  /** Screen flash + barrel smoke layers (world-space; group added by Game). */
  private gunJuice: GunJuice | null = null;
  /** Previous-frame pointer look, for look-lag deltas + recoil smoothing speed. */
  private prevLookYaw = 0;
  private prevLookPitch = 0;
  private grenadeViewModel: GrenadeViewModel | null = null;
  private fpArmsViewModel: FpArmsViewModel | null = null;
  private katanaSlashFx: KatanaSlashTrailFx | null = null;
  private onShoot: ShootCallback | null = null;
  private onAutoFireStopNetwork: AutoFireStopCallback | null = null;
  private onReloadNetwork: ReloadNetworkCallback | null = null;
  private onReloadStopNetwork: ReloadStopNetworkCallback | null = null;
  private onWeaponSwitchNetwork: WeaponSwitchCallback | null = null;
  private onMeleeEquipNetwork: MeleeEquipCallback | null = null;
  private onMeleeAttackNetwork: MeleeAttackNetworkCallback | null = null;
  private onGrenadeThrowNetwork: ((request: GrenadeThrowRequest) => void) | null = null;
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
  private targetSliding = false;
  private targetShieldRecharging = false;
  private targetShieldRechargeEndAt = 0;
  private locomotionWalking = false;
  private locomotionWalkingBackward = false;
  private locomotionMoving = false;
  private locomotionSprinting = false;
  private locomotionJumping = false;
  private locomotionCrouching = false;
  private crouchBlend = 0;
  private remoteDisplayedWeaponId: WeaponId = LOADOUT_WEAPON_IDS[0];
  private readonly remoteWeaponBasePosition = new THREE.Vector3();
  private readonly remoteWeaponBaseRotation = new THREE.Euler();
  private readonly activeMeshBaseRotation = new THREE.Euler();
  private fireCooldown = 0;
  private throwableEquipped = false;
  /** World time when the held grenade's fuse started (0 = not cooking). */
  private grenadeCookStartAt = 0;
  private grenadeCookFuseEndAt = 0;
  /**
   * Wall-clock ms when cook/throw input (G or LMB) was pressed while equipped.
   * Used to distinguish a tap (throw) from a hold (start cooking).
   */
  private grenadeThrowHoldStartedAtMs = 0;
  private localAutoFiring = false;
  /** True once at least one round fired during the current LMB hold. */
  private fireTriggerHadShot = false;
  /** Play shot-end echo after a burst finishes if the trigger was already released. */
  private pendingShotEndEcho = false;
  /** Remaining shots in an active burst (0 = idle / between bursts). */
  private burstShotsRemaining = 0;
  private weaponSounds: WeaponSoundService | null = null;
  private grenadeSounds: GrenadeSoundService | null = null;
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
  private readonly bodyHitVolumes: BodyPartVolume[] = [];

  private constructor(local: boolean) {
    this.loadout = new WeaponLoadout(PICKABLE_WEAPON_CONFIGS, KATANA_CONFIG);

    if (local) {
      this.headRig = new THREE.Group();
      this.yawRecoilRig = new THREE.Group();
      this.aimRig = new THREE.Group();
      this.pitchRig = new THREE.Group();
      this.pitchRecoilRig = new THREE.Group();
      this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.01,
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
      this.weaponPose.setViewConfig(
        this.loadout.getActive()!.config.view,
        this.loadout.getActive()!.config.adsTime,
      );
      this.weaponSway = new WeaponSwaySystem();
      this.gunJuice = new GunJuice();
      this.grenadeViewModel = new GrenadeViewModel(this.camera);
      this.fpArmsViewModel = new FpArmsViewModel();
      this.katanaSlashFx = new KatanaSlashTrailFx();
      this.katanaSlashFx.attachToCamera(this.camera);
      this.loadout.attach(this.camera, LOCAL_WEAPON_ROTATION, 'local');
      this.syncFpArmsVisibility();
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

  /** World-space gun juice (barrel smoke) — Game adds this to the scene root. */
  getGunJuiceGroup(): THREE.Group | null {
    return this.gunJuice?.group ?? null;
  }

  static createRemote(_color = 0x6a9fd4): Player {
    return new Player(false);
  }

  static async preloadGameCharacterModels(): Promise<void> {
    await preloadGameCharacterModels();
  }

  /**
   * Called every frame per remote player — the common "model already
   * displayed" path must stay synchronous and allocation-free (an async
   * method allocates a Promise even when it early-returns, which adds up
   * to real GC pressure across players × frames).
   */
  syncRemoteCharacterModel(worldTime: number): void {
    if (this.camera) return;

    this.tickRemoteDeath();
    if (!this.alive) {
      if (this.remoteDeathActive && this.object.visible) {
        const skinId = this.remoteSelectedCharacterId;
        const meshFile = getCharacterMeshFile(skinId);
        const deathKey = `${skinId}::${meshFile}::${CHARACTER_MODEL_FILES.death}`;
        if (
          !(
            this.displayedCharacterModelFile === CHARACTER_MODEL_FILES.death
            && this.displayedCharacterMeshFile === meshFile
            && this.displayedCharacterSkinId === skinId
          )
          && this.remoteModelLoadingFile !== deathKey
        ) {
          this.remoteModelLoadingFile = deathKey;
          void this.ensureRemoteDeathModel().finally(() => {
            this.remoteModelLoadingFile = null;
          });
        }
        return;
      }
      this.object.visible = false;
      return;
    }

    const weaponId = this.targetActiveWeaponId;
    const pose = this.getRemotePose(worldTime);
    const modelFile = gameModelFileForWeapon(weaponId, pose);
    const skinId = this.remoteSelectedCharacterId;
    const meshFile = getCharacterMeshFile(skinId);
    const operatorId = this.remoteSelectedOperatorId;
    const displayKey = `${skinId}::${meshFile}::${modelFile}::${operatorId}`;
    if (
      this.displayedCharacterModelFile === modelFile
      && this.displayedCharacterMeshFile === meshFile
      && this.displayedCharacterSkinId === skinId
      && this.displayedOperatorId === operatorId
      && this.characterInstance
    ) {
      return;
    }
    if (this.remoteModelLoadingFile === displayKey) return;

    this.remoteModelLoadingFile = displayKey;
    void loadGameCharacterTemplate(weaponId, pose, meshFile, skinId)
      .then((template) => {
        this.setCharacterModel(template);
        this.applyRemoteAim();
        this.characterInstance?.update(0);
        this.applyRemoteSpinePitch();
      })
      .finally(() => {
        this.remoteModelLoadingFile = null;
      });
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
    const skinId = this.remoteSelectedCharacterId;
    const meshFile = getCharacterMeshFile(skinId);
    if (
      this.displayedCharacterModelFile === CHARACTER_MODEL_FILES.death
      && this.displayedCharacterMeshFile === meshFile
      && this.displayedCharacterSkinId === skinId
      && this.characterInstance
    ) {
      return;
    }

    const template = await loadDeathCharacterTemplate(meshFile, skinId);
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
    const activeReloadSec = this.loadout?.getActive()?.config.reloadSec;
    const { reloading } = getReloadState(
      this.targetReloadEndAt,
      worldTime,
      this.targetActiveWeaponId,
      activeReloadSec,
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
      sliding: this.targetSliding,
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
    if (
      this.displayedCharacterModelFile === template.modelFile
      && this.displayedCharacterMeshFile === template.meshFile
      && this.displayedCharacterSkinId === template.skinId
      && this.displayedOperatorId === this.remoteSelectedOperatorId
      && this.characterInstance
    ) {
      return;
    }

    if (this.lookRigFollowsHead && this.lookRig.parent) {
      this.lookRig.parent.remove(this.lookRig);
      this.object.add(this.lookRig);
      this.lookRigFollowsHead = false;
    }

    this.characterInstance?.dispose();
    this.characterInstance = createCharacterInstance(template, {
      characterId: this.remoteSelectedCharacterId,
      operatorId: this.remoteSelectedOperatorId,
    });
    this.pitchPivot.add(this.characterInstance.root);
    this.displayedCharacterModelFile = template.modelFile;
    this.displayedCharacterMeshFile = template.meshFile;
    this.displayedCharacterSkinId = template.skinId;
    this.displayedOperatorId = this.remoteSelectedOperatorId;
    this.bodyPartBones = resolveBodyPartBones(this.characterInstance.root);
    this.bindRemoteCharacterRig(template);
    this.refreshRemoteUiTopOffset();
    this.syncEnemyOutline();
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

    // lookRig must not parent to Head — Head is collapsed for the 3D face.
    const lookParent = resolveFaceLookParent(this.characterInstance.root) ?? rig.head;
    this.object.remove(this.lookRig);
    this.lookRig.position.set(0, 0, 0);
    this.lookRig.rotation.set(0, 0, 0);
    lookParent.add(this.lookRig);
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
    isSliding: boolean;
  } {
    if (this.camera) {
      return {
        isSprinting: this.sprint.getState().isSprinting,
        isWalking: this.locomotionWalking,
        isWalkingBackward: this.locomotionWalkingBackward,
        isJumping: !this.physics.grounded,
        isCrouching: this.locomotionCrouching,
        isSliding: this.locomotionSliding,
      };
    }

    return {
      isSprinting: this.targetSprinting,
      isWalking: this.targetWalking,
      isWalkingBackward: this.targetWalkingBackward,
      isJumping: this.targetJumping,
      isCrouching: this.targetCrouching,
      isSliding: this.targetSliding,
    };
  }

  getAmmoState(): LoadoutAmmoState | null {
    return this.loadout?.getAmmoState() ?? null;
  }

  getInventory(): PlayerInventory {
    return this.inventory;
  }

  isThrowableEquipped(): boolean {
    return this.throwableEquipped;
  }

  unequipThrowable(options?: { discardCook?: boolean }): void {
    if (!this.throwableEquipped) return;
    if (this.isCookingGrenade() && !options?.discardCook) {
      // Pin already pulled — switching away throws with remaining fuse.
      this.tryThrowGrenade();
      if (!this.throwableEquipped) return;
    }
    this.clearGrenadeCook();
    this.throwableEquipped = false;
    this.syncThrowableHolster();
  }

  private isCookingGrenade(): boolean {
    return this.grenadeCookStartAt > 0;
  }

  private clearGrenadeCook(): void {
    this.grenadeCookStartAt = 0;
    this.grenadeCookFuseEndAt = 0;
    this.grenadeThrowHoldStartedAtMs = 0;
    this.grenadeViewModel?.stopCooking();
  }

  private getGrenadeFuseRemainingSec(): number {
    if (!this.isCookingGrenade()) return GRENADE_FUSE_SEC;
    const worldTime = this.shieldDomeWorldTime?.() ?? 0;
    return Math.max(0, this.grenadeCookFuseEndAt - worldTime);
  }

  triggerExplosionShake(explosionX: number, explosionY: number, explosionZ: number): void {
    if (!this.camera) return;
    this.camera.getWorldPosition(this.muzzleOrigin);
    this.explosionCameraShake.trigger(
      explosionX,
      explosionY,
      explosionZ,
      this.muzzleOrigin.x,
      this.muzzleOrigin.y,
      this.muzzleOrigin.z,
    );
  }

  getThrowableArcPreview(): GrenadeArcPreviewResult | null {
    if (!this.throwableEquipped || !this.camera) return null;
    const pose = this.computeGrenadeThrowPose();
    if (!pose) return null;
    return predictGrenadeArcPreview(
      pose.x,
      pose.y,
      pose.z,
      pose.velX,
      pose.velY,
      pose.velZ,
      (x, z) => getClientMapDef().sampleGroundHeight(x, z),
      4,
      0.04,
    );
  }

  getInventoryWeapons(): InventoryWeaponEntry[] {
    if (!this.loadout) return [];

    const activeIndex = this.loadout.getActiveIndex();
    const meleeEquipped = this.loadout.isMeleeEquipped();
    const throwableEquipped = this.throwableEquipped;
    return Array.from({ length: LOADOUT_SIZE }, (_, slotIndex) => {
      const weaponId = this.loadout!.getSlotWeaponId(slotIndex);
      const occupied = weaponId !== null;
      return {
        slotIndex,
        weaponId,
        name: occupied ? (getWeaponConfig(weaponId)!.name) : 'Empty',
        active:
          occupied &&
          !meleeEquipped &&
          !throwableEquipped &&
          slotIndex === activeIndex,
        occupied,
      };
    });
  }

  getInventoryMelee(): InventoryMeleeEntry {
    return {
      name: KATANA_CONFIG.name,
      active: (this.loadout?.isMeleeEquipped() ?? false) && !this.throwableEquipped,
    };
  }

  requestInventoryWeaponSwitch(slotIndex: number): boolean {
    return this.tryResumeWeaponSlot(slotIndex, true);
  }

  requestInventoryMeleeEquip(): boolean {
    if (!this.loadout || !this.camera) return false;
    if (this.loadout.isMeleeEquipped() && !this.throwableEquipped) return false;
    if (!this.loadout.tryEquipMelee(true, { bypassCooldown: true })) return false;

    this.unequipThrowable();
    this.stopWeaponAutoFire();
    const active = this.loadout.getActive();
    if (!active) return false;

    this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
    this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
    this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    this.syncFpArmsVisibility();
    this.onMeleeEquipNetwork?.(true);
    return true;
  }

  applyLoadoutFromSnapshot(snapshot: PlayerSnapshot): void {
    if (!this.loadout || !this.camera) return;

    if (this.throwableEquipped) {
      this.loadout.applyServerSlotAssignments(snapshot);
      // Keep numbered slots in sync, but don't leave a newly granted gun unequipped
      // if the throwable is put away on the same frame as the pickup grant.
      if (isWeaponId(snapshot.activeWeaponId)) {
        this.targetActiveWeaponId = snapshot.activeWeaponId;
      }
      return;
    }

    const prevActiveWeaponId = this.loadout.getActiveWeaponId();

    this.loadout.applyServerSlots(snapshot, snapshot.activeWeaponId);
    this.reapplyMatchWeaponStats();
    if (isWeaponId(snapshot.activeWeaponId)) {
      this.targetActiveWeaponId = snapshot.activeWeaponId;
      this.loadout.setRemoteActiveWeapon(snapshot.activeWeaponId);
      const active = this.loadout.getActive();
      if (active) {
        this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
        this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
      }
    } else {
      this.stopWeaponAutoFire();
    }

    if (
      this.throwableEquipped &&
      isWeaponId(snapshot.activeWeaponId) &&
      snapshot.activeWeaponId !== prevActiveWeaponId
    ) {
      this.unequipThrowable();
    }
  }

  /** Equip an Armory primary/secondary pair locally (inventory + view model). */
  applyArmoryLoadout(primaryWeaponId: string, secondaryWeaponId: string): boolean {
    if (!this.loadout || !this.camera) return false;
    if (!isPickableWeaponId(primaryWeaponId) || !isPickableWeaponId(secondaryWeaponId)) {
      return false;
    }
    if (primaryWeaponId === secondaryWeaponId) return false;

    this.unequipThrowable({ discardCook: true });
    this.loadout.applyServerSlots(
      {
        weaponSlot0: primaryWeaponId,
        weaponSlot1: secondaryWeaponId,
        weaponSlot2: EMPTY_WEAPON_SLOT,
      },
      primaryWeaponId,
    );
    this.reapplyMatchWeaponStats();
    this.targetActiveWeaponId = primaryWeaponId;
    this.loadout.setRemoteActiveWeapon(primaryWeaponId);
    const active = this.loadout.getActive();
    if (active) {
      this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
      this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    }
    return true;
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

  /**
   * Render the sniper scope-lens RT (call before the main scene render).
   * No-op when the optic isn't bound or ADS is inactive.
   */
  renderScopeLens(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.camera || !this.scopeLens.isBound) return;
    this.scopeLens.render(renderer, scene, this.camera);
  }

  /** 0–1 main-view blur while sniper scope-lens ADS is active. */
  getScopeWorldBlur(): number {
    if (!this.scopeLens.isBound) return 0;
    if (this.loadout?.getActive()?.config.view.scopeLensAds !== true) return 0;
    return this.weaponPose?.adsBlend ?? 0;
  }

  getActiveDamage(): number {
    return this.loadout?.getActiveDamage() ?? 0;
  }

  /** Apply Armory effective stats before match combat (damage, mag, reload, recoil, ADS, range). */
  applyWeaponEffectiveStats(statsById: ReadonlyMap<string, WeaponEffectiveStats>): void {
    this.matchWeaponStatsById = statsById;
    this.loadout?.applyEffectiveStatsByWeaponId(statsById);
    const active = this.loadout?.getActive();
    if (active) {
      this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
    }
  }

  /** Re-apply cached Armory stats (e.g. after loadout slot sync). */
  reapplyMatchWeaponStats(): void {
    if (!this.matchWeaponStatsById || this.matchWeaponStatsById.size === 0) return;
    this.loadout?.applyEffectiveStatsByWeaponId(this.matchWeaponStatsById);
    const active = this.loadout?.getActive();
    if (active) {
      this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
    }
  }

  /** Active weapon max hit distance (Armory range), if configured. */
  getActiveMaxHitDistance(): number | undefined {
    const active = this.loadout?.getActive();
    if (!active) return undefined;
    if (active.config.maxHitDistance !== undefined) return active.config.maxHitDistance;
    if (active.config.meleeRange !== undefined) return active.config.meleeRange;
    return undefined;
  }

  /** Active weapon reload duration (Armory reloadTime). */
  getActiveReloadSec(): number | undefined {
    return this.loadout?.getActive()?.config.reloadSec;
  }

  addReserveClip(): void {
    this.loadout?.addReserveToActive();
  }

  refillAmmo(): void {
    this.loadout?.refillAllAmmo();
  }

  applyRespawnFromServer(snapshot: PlayerSnapshot): void {
    if (!this.loadout || !this.camera) return;

    this.unequipThrowable({ discardCook: true });
    this.applyLoadoutFromSnapshot(snapshot);
    this.loadout.resetForRespawn();
    this.slide.cancel();
    this.locomotionSliding = false;
    this.landSlideGraceSec = 0;
    this.sprintChargeSec = 0;
    this.airborneSlideChargeSec = 0;
    this.targetReloadEndAt = 0;
    this.targetWeaponSwitchEndAt = 0;
    this.targetMeleeAttackEndAt = 0;
    this.weaponSwitchAnimConsumed = false;
    this.meleeAttackAnimConsumed = false;
    this.fireCooldown = 0;
    this.stopWeaponAutoFire();
    this.weaponPose?.reset();

    const active = this.loadout.getActive();
    if (active) {
      this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
      this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    }
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

  setGrenadeSoundService(service: GrenadeSoundService | null): void {
    this.grenadeSounds = service;
  }

  setFootstepSoundService(service: FootstepSoundService | null): void {
    this.footstepSounds = service;
  }

  setReloadNetworkCallback(callback: ReloadNetworkCallback | null): void {
    this.onReloadNetwork = callback;
  }

  setReloadStopNetworkCallback(callback: ReloadStopNetworkCallback | null): void {
    this.onReloadStopNetwork = callback;
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

  setGrenadeThrowNetworkCallback(
    callback: ((request: GrenadeThrowRequest) => void) | null,
  ): void {
    this.onGrenadeThrowNetwork = callback;
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

  updateCrosshairAim(hud: CrosshairHud, _width: number, _height: number): void {
    // Camera-recoil aim: reticle stays screen-center; weapon sway/visual kick are cosmetic only.
    hud.setAimOffset(0, 0);
    // Global ADS rule: centered neon cyan circle — except sniper scope lens (optic reticle).
    const ads = (this.weaponPose?.adsBlend ?? 0) > 0.15;
    const scopeLensAds = this.loadout?.getActive()?.config.view.scopeLensAds === true;
    hud.setAdsActive(ads, { hideCenterDot: ads && scopeLensAds });
    hud.setMovementSpread(this.locomotionMoving, this.locomotionSprinting);
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

  private bodyHitVolumesDirty = true;

  /**
   * Cached bone-driven hit capsules — recomputed lazily on first query after
   * each remote pose update. Building the volumes allocates dozens of small
   * objects, so doing it per remote per frame (instead of only when a shot
   * actually needs them) was a measurable GC pressure source.
   */
  getBodyHitVolumes(): readonly BodyPartVolume[] | null {
    if (this.bodyHitVolumesDirty) {
      this.refreshCombatHitVolumes();
      this.bodyHitVolumesDirty = false;
    }
    return this.bodyHitVolumes.length > 0 ? this.bodyHitVolumes : null;
  }

  refreshCombatHitVolumes(): void {
    if (!this.bodyPartBones || !this.characterInstance) {
      this.bodyHitVolumes.length = 0;
      return;
    }

    this.object.updateMatrixWorld(true);
    const boneRefs = readBodyPartBoneRefsWorld(this.bodyPartBones);
    const next = bodyPartVolumesFromBoneRefs(boneRefs);
    this.bodyHitVolumes.length = 0;
    for (const volume of next) {
      this.bodyHitVolumes.push(volume);
    }
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

  /** Side-vent offsets in flash-local space for the active (or matching) weapon mesh. */
  readActiveSideVentFlashOffsets(
    muzzleOrigin: THREE.Vector3,
    fireDirection: THREE.Vector3,
    out: THREE.Vector3[],
    weaponId?: string,
  ): number {
    if (!this.loadout || this.camera) return 0;

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

    if (!mesh) return 0;

    this.object.updateMatrixWorld(true);
    return readWeaponSideVentFlashOffsets(mesh, muzzleOrigin, fireDirection, out);
  }

  getNetworkAim(): { yaw: number; pitch: number } {
    if (!this.camera) return { yaw: 0, pitch: 0 };
    // Use pointer-lock aim state — decomposing the world camera quaternion near
    // vertical pitch (gimbal lock) can yield unstable yaw/pitch spikes.
    // Include live recoil/kick offsets so remotes' spine pitch tracks the same
    // climb the local camera sees (lookPitch alone stays flat until bake-on-stop).
    if (this.aimControls) {
      const feel = this.getActiveFeel();
      const offset = feel?.getCameraAimOffset() ?? { pitch: 0, yaw: 0 };
      return {
        yaw: this.aimControls.lookYaw + offset.yaw,
        pitch: THREE.MathUtils.clamp(
          this.aimControls.lookPitch + offset.pitch,
          -AIM_PITCH_LIMIT,
          AIM_PITCH_LIMIT,
        ),
      };
    }
    this.object.updateMatrixWorld(true);
    return readWorldPlayerAim(this.camera);
  }

  setEyePosition(x: number, y: number, z: number, resetLook = true): void {
    this.object.position.set(x, y - EYE_HEIGHT, z);
    this.object.rotation.set(0, 0, 0);
    this.physics = { verticalVelocity: 0, grounded: true };
    if (resetLook) {
      this.resetLocalView();
    }
  }

  private resetLocalView(): void {
    if (!this.camera) return;

    this.unequipThrowable({ discardCook: true });
    this.grenadeThrowKick.reset();
    this.explosionCameraShake.reset();
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
      this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
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
      if (!this.throwableEquipped) {
        this.loadout?.setRemoteActiveWeapon(snapshot.activeWeaponId);
      }
    }
    this.targetSprinting = snapshot.sprinting;
    this.targetWalking = snapshot.walking;
    this.targetWalkingBackward = snapshot.walkingBackward;
    this.targetJumping = snapshot.jumping;
    this.targetCrouching = snapshot.crouching || snapshot.sliding;
    this.targetSliding = snapshot.sliding === true;
    this.targetShieldRecharging = snapshot.shieldRecharging;
    this.targetShieldRechargeEndAt = snapshot.shieldRechargeEndAt;
    this.teamId = snapshot.teamId;
    const wasAlive = this.alive;
    this.alive = snapshot.alive;
    this.username = snapshot.username;
    if (!this.camera) {
      this.remoteSelectedCharacterId =
        snapshot.selectedCharacterId || DEFAULT_CHARACTER_ITEM_ID;
      this.remoteSelectedOperatorId =
        snapshot.selectedOperatorId || DEFAULT_OPERATOR_CHARACTER_ID;
    }

    if (this.camera && wasAlive && !snapshot.alive) {
      this.loadout?.cancelAllReloads();
      this.stopWeaponAutoFire();
    }

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
          this.onShieldBreakListener?.();
        }
      }

      this.remoteHealthBar?.update(
        snapshot.hp,
        snapshot.alive,
        snapshot.teamId,
        snapshot.username,
        snapshot.shieldPoints,
        getShieldCapacity(snapshot.shieldLevel),
      );
    }

    this.hp = snapshot.hp;
    this.shieldLevel = snapshot.shieldLevel;
    this.shieldPoints = snapshot.shieldPoints;
    if (this.camera) {
      this.inventory.setShieldCharges(snapshot.shieldCharges);
    } else if (this.loadout) {
      this.loadout.applyServerSlots(snapshot, snapshot.activeWeaponId);
      this.reapplyMatchWeaponStats();
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
    // Clear any leftover slide mesh drop from earlier tuning.
    if (this.pitchPivot && !this.remoteDeathActive) {
      this.pitchPivot.position.y = 0;
    }

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
    // Mark hit capsules stale; they're rebuilt lazily in getBodyHitVolumes()
    // only when a shot/melee query actually needs them.
    this.bodyHitVolumesDirty = true;
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

  /** Enemies get a red silhouette outline plus red nameplate styling. */
  setEnemyHighlight(isEnemy: boolean): void {
    if (this.camera) return;
    this.enemyHighlighted = isEnemy;
    this.remoteHealthBar?.setEnemyStyle(isEnemy);
    this.syncEnemyOutline();
  }

  private syncEnemyOutline(): void {
    const modelRoot = this.characterInstance?.root ?? null;
    if (!this.enemyHighlighted || !this.isAlive() || !modelRoot) {
      this.enemyOutline?.detach();
      return;
    }
    this.enemyOutline ??= new EnemyOutlineFx();
    // No-op when already attached to the current model root.
    this.enemyOutline.attach(modelRoot);
  }

  private syncRemoteUiHeight(): void {
    if (!this.remoteHealthBar) return;

    this.remoteHealthBar.setHeadTopOffset(this.remoteHeadTopOffset);
    // Sit just above the mesh crown so floats read at head height.
    this.damageNumberStack?.setHeadTopOffset(this.remoteHeadTopOffset + 0.16);
  }

  private refreshRemoteUiTopOffset(): void {
    if (!this.characterInstance) {
      this.remoteHeadTopOffset = EYE_HEIGHT + REMOTE_UI_HEAD_CLEARANCE;
      return;
    }

    this.remoteHeadTopOffset = computeTopOffsetAboveFeet(
      this.characterInstance.root,
      this.object,
      REMOTE_UI_HEAD_CLEARANCE,
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

  updateDamageNumbers(delta: number, camera: THREE.Camera): void {
    this.damageNumberStack?.update(delta, camera);
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
        this.weaponPose.setViewConfig(active.config.view, active.config.adsTime);
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
    const { reloading, progress } = getReloadState(
      this.targetReloadEndAt,
      worldTime,
      this.targetActiveWeaponId,
      active.config.reloadSec,
    );
    this.weaponPose.update(delta, false, reloading, progress);
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
    this.grenadeThrowKick.update(delta);
    this.explosionCameraShake.update(delta);

    // Mouse look delta this frame — feeds look-lag and recoil smoothing.
    const lookDeltaYaw = (this.aimControls?.lookYaw ?? 0) - this.prevLookYaw;
    const lookDeltaPitch = (this.aimControls?.lookPitch ?? 0) - this.prevLookPitch;
    this.prevLookYaw = this.aimControls?.lookYaw ?? 0;
    this.prevLookPitch = this.aimControls?.lookPitch ?? 0;
    const lookSpeed = delta > 0 ? Math.hypot(lookDeltaYaw, lookDeltaPitch) / delta : 0;

    if (!canAct) {
      this.slide.cancel();
      this.locomotionSliding = false;
      this.stopWeaponAutoFire();
      this.gunJuice?.update(delta, null, false);
      this.headBob.update(delta, false, false);
      if (this.headRig) this.headBob.apply(this.headRig, false);
      if (this.aimControls) this.aimControls.pointerSpeed = 1;
      if (this.yawRecoilRig && this.pitchRecoilRig) {
        this.applyActiveRecoilAim();
      }
      // Keep gravity / grounding while inventory is open so the match doesn't
      // feel frozen — only combat + WASD are disabled (canAct).
      const idle = stepPlayerPhysicsClient(
        this.object.position.x,
        this.object.position.y,
        this.object.position.z,
        this.physics,
        0,
        0,
        false,
        delta,
        this.mapCollisionDef,
      );
      this.object.position.set(idle.x, idle.y, idle.z);
      this.physics = idle.state;
      if (this.physics.grounded) {
        this.locomotionJumping = false;
      }
      this.loadout?.update(delta);
      this.weaponPose?.applyCamera(this.camera);
      this.syncFpArmsToActiveWeapon();
      this.fpArmsViewModel?.update(delta);
      return;
    }

    this.trySwitchWeapon(input);
    this.tryToggleMeleeEquip(input);
    this.updateThrowableInput(input, pointer);

    // Slide: sprint + C, or C on/soon after landing — capture look-forward first.
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();

    if (this.physics.grounded) {
      if (this.landSlideGraceSec > 0) {
        this.landSlideGraceSec = Math.max(0, this.landSlideGraceSec - delta);
        if (this.landSlideGraceSec <= 0) {
          this.airborneSlideChargeSec = 0;
        }
      }
    } else {
      // Keep grace from starting mid-air; landing sets it below after physics.
      this.landSlideGraceSec = 0;
    }

    const canStartSlideWithoutSprint = this.landSlideGraceSec > 0;
    const canStartSlide =
      this.physics.grounded &&
      (this.sprint.getState().isSprinting || canStartSlideWithoutSprint);
    if (input.isJustPressed('KeyC') && canStartSlide) {
      // Land grace uses charge frozen at jump; grounded sprint uses live charge.
      const chargeSec = canStartSlideWithoutSprint
        ? this.airborneSlideChargeSec
        : this.sprintChargeSec;
      const charge01 = Math.min(1, chargeSec / SPRINT_CHARGE_FULL_SEC);
      this.slide.tryStart(this.forward.x, this.forward.z, charge01);
    }

    // Jump cancels slide and launches — allows immediate resprint after.
    const jumpRequested = input.isJustPressed('Space');
    const jumpFromSlide =
      this.slide.isActive() && jumpRequested && this.physics.grounded;
    if (jumpFromSlide) {
      this.slide.cancel();
    }

    const isSliding = this.slide.isActive();
    this.locomotionSliding = isSliding;

    // Slide forces crouch pose / eye height; jump-from-slide ignores held C this frame.
    const wantsCrouch =
      (input.isPressed('KeyC') || isSliding) && !jumpFromSlide;
    const isCrouching = wantsCrouch && this.physics.grounded;

    const wantsSprint =
      !wantsCrouch &&
      !isSliding &&
      input.isPressed('ShiftLeft') &&
      input.isPressed('KeyW') &&
      this.physics.grounded;
    const isSprinting = this.sprint.update(delta, wantsSprint);
    if (isSprinting) {
      this.sprintChargeSec = Math.min(
        SPRINT_CHARGE_FULL_SEC,
        this.sprintChargeSec + delta,
      );
    } else if (this.physics.grounded && !isSliding) {
      this.sprintChargeSec = 0;
    }
    const isMoving =
      this.physics.grounded &&
      (isSliding ||
        input.isPressed('KeyW') ||
        input.isPressed('KeyS') ||
        input.isPressed('KeyA') ||
        input.isPressed('KeyD'));
    const isWalking = isMoving && !isSprinting && !isSliding;
    const isWalkingBackward =
      isWalking && input.isPressed('KeyS') && !input.isPressed('KeyW');
    this.locomotionWalking = isWalking;
    this.locomotionWalkingBackward = isWalkingBackward;
    this.locomotionMoving = isMoving;
    this.locomotionSprinting = isSprinting || isSliding;

    this.loadout.update(delta);

    const active = this.loadout.getActive();
    const meleeEquipped = this.loadout.isMeleeEquipped();
    let shooting = false;
    let ammoReloading = false;
    let ammoReloadProgress = 0;
    let ads = false;

    if (active && !this.throwableEquipped) {
      if (input.isJustPressed('KeyR')) {
        this.beginActiveWeaponReload();
      }

      this.tryStartShieldRecharge(input);

      ads = !meleeEquipped && pointer.isPressed(POINTER_ADS);
      const shellReloadEvent = active.ammo.consumeShellReloadUpdate();
      if (shellReloadEvent?.shellInserted) {
        if (shellReloadEvent.magazineFull) {
          this.weaponSounds?.playReloadComplete(active.config.sounds);
        } else {
          this.weaponSounds?.playReloadPartial(active.config.sounds);
        }
        if (shellReloadEvent.finished) {
          this.onReloadStopNetwork?.();
        }
      }

      const ammoState = active.ammo.getState();
      ammoReloading = ammoState.reloading;
      ammoReloadProgress = ammoState.reloadProgress;
      if (ammoState.reloading) {
        this.stopWeaponAutoFire();
      }
      const shellReload = active.ammo.isShellReloadStyle();
      const reloadDurationSec = shellReload
        ? Math.max(0.05, active.config.reloadSec / Math.max(1, active.config.clipSize))
        : Math.max(0.05, Number(active.config.reloadSec) || 1);
      // FPS arms are guns-only — hide + no sprint/reload clips while melee is out.
      // Pistol reload skips the arms clip and dips the gun procedurally instead.
      const pistolEquipped = active.config.id === 'pistol';
      const armsReload = !meleeEquipped && !pistolEquipped && ammoState.reloading;
      const armsSprint = !meleeEquipped && isSprinting && !ammoState.reloading;
      this.fpArmsViewModel?.setReloading(
        armsReload,
        reloadDurationSec,
        shellReload,
      );
      // Stance before sprint so pistol → sprint mesh swap uses the right set.
      this.fpArmsViewModel?.setStance(pistolEquipped ? 'pistol' : 'rifle');
      this.fpArmsViewModel?.setSprinting(armsSprint);

      shooting =
        this.throwableEquipped
          ? false
          : active.config.fireMode === 'melee'
            ? this.weaponPose?.isSlashing() ?? false
            : this.isFiring(pointer, active.config.fireMode);

      this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
      const bindWeaponToHand = armsReload || armsSprint;
      this.weaponPose?.update(
        delta,
        ads,
        ammoState.reloading,
        ammoState.reloadProgress,
        {
          ignoreAds: meleeEquipped,
          forceHip: bindWeaponToHand || (pistolEquipped && ammoState.reloading),
          proceduralReload: pistolEquipped,
        },
      );
      if (this.aimControls) {
        const adsLookSensitivity = active.config.view.adsLookSensitivity ?? 1;
        const adsBlend = meleeEquipped ? 0 : (this.weaponPose?.adsBlend ?? 0);
        this.aimControls.pointerSpeed = THREE.MathUtils.lerp(1, adsLookSensitivity, adsBlend);
      }
      const adsBlend = meleeEquipped ? 0 : (this.weaponPose?.adsBlend ?? 0);
      this.weaponSway?.setWeapon(active.config.id);
      const justJumped = this.pendingSwayJump;
      const justLanded = this.pendingSwayLand;
      this.pendingSwayJump = false;
      this.pendingSwayLand = false;
      this.weaponSway?.update(delta, {
        moveX: (input.isPressed('KeyD') ? 1 : 0) - (input.isPressed('KeyA') ? 1 : 0),
        moveZ: (input.isPressed('KeyW') ? 1 : 0) - (input.isPressed('KeyS') ? 1 : 0),
        lookDeltaYaw,
        lookDeltaPitch,
        walking: isWalking,
        sprinting: isSprinting,
        shooting,
        grounded: this.physics.grounded,
        adsBlend,
        reloading: ammoState.reloading,
        // Sniper stabilizer — Shift while scoped (sprint needs W + ground anyway).
        holdingBreath: input.isPressed('ShiftLeft'),
        verticalVelocity: this.physics.verticalVelocity,
        justJumped,
        justLanded,
        // Previous-frame HeadBob phase keeps weapon footstep bob locked in.
        walkPhase: this.headBob.getPhase(),
      });

      // Fast counter-tracking dampens incoming recoil (Apex recoil smoothing).
      active.feel.setLookVelocity(lookSpeed);

      // Fire before feel.update so onShot kick integrates this frame (not next).
      this.updateFire(delta, pointer, projectiles);
      this.updateMeleeAttack(delta, input, pointer, projectiles);

      active.feel.update(delta, shooting, ads);
      // Fold temporary recoil into permanent look so stopping fire doesn't
      // yank the camera back down to the pre-spray aim.
      if (this.aimControls) {
        const bake = active.feel.getRecoilBakeScratch();
        if (active.feel.consumeRecoilBake(bake)) {
          this.aimControls.lookPitch = THREE.MathUtils.clamp(
            this.aimControls.lookPitch + bake.pitch,
            -AIM_PITCH_LIMIT,
            AIM_PITCH_LIMIT,
          );
          this.aimControls.lookYaw += bake.yaw;
          this.aimControls.applyLook();
        }
      }
      const baseRotation = this.getActiveMeshBaseRotation();
      const wasWeaponOnHand = this.fpArmsViewModel?.isWeaponBoundToHand() ?? false;

      // Entering hand-bind (reload/sprint): snap to hip before parenting gun to the hand.
      if (bindWeaponToHand && !wasWeaponOnHand) {
        this.applyActiveWeaponPose(baseRotation);
        this.weaponPose?.applyCamera(this.camera);
        this.syncFpArmsToActiveWeapon();
      }

      if (this.camera) {
        this.fpArmsViewModel?.syncWeaponHandBinding(
          active.mesh,
          this.camera,
          bindWeaponToHand,
        );
      }

      const weaponOnHand = this.fpArmsViewModel?.isWeaponBoundToHand() ?? false;
      // While the gun is on the right-hand bone, the arms clip owns its transform.
      if (!weaponOnHand) {
        this.applyActiveWeaponPose(ammoState.reloading ? baseRotation : undefined);
        this.weaponPose?.applyCamera(this.camera);
        const weaponRotation = this.weaponPose?.getWeaponRotation(baseRotation) ?? baseRotation;
        if (!ammoState.reloading) {
          // Layer order: pose position (already applied) → pose rotation →
          // spring kickback (additive) → sway/look-lag (additive).
          active.mesh.rotation.copy(weaponRotation);
          active.feel.applyWeaponVisual(active.mesh);
          this.weaponSway?.apply(active.mesh, weaponRotation);
        }
      } else {
        this.weaponPose?.applyCamera(this.camera);
        // Hand-bind path skips pose/sight sync — still update scope-lens zoom.
        this.syncScopeLens(active);
      }
      this.syncFpArmsToActiveWeapon();
      // After hand-bind so melee hide can't unbind/rebind in the same frame.
      this.syncFpArmsVisibility();

      // Barrel smoke + screen-flash decay track the live muzzle position.
      if (this.gunJuice) {
        readWeaponMuzzleWorldPosition(active.mesh, this.muzzleOrigin);
        this.gunJuice.update(delta, this.muzzleOrigin, shooting);
      }
    } else if (this.throwableEquipped) {
      this.stopWeaponAutoFire();
      this.gunJuice?.update(delta, null, false);
      this.tryStartShieldRecharge(input);
      if (this.aimControls) this.aimControls.pointerSpeed = 1;
      this.weaponPose?.applyCamera(this.camera);
      this.fpArmsViewModel?.setReloading(false);
      this.fpArmsViewModel?.setSprinting(false);
      if (this.camera) {
        this.fpArmsViewModel?.syncWeaponHandBinding(null, this.camera, false);
      }
      this.syncFpArmsToActiveWeapon();
      this.grenadeViewModel?.update(
        delta,
        isWalking,
        isSprinting,
        this.physics.grounded,
        this.shieldDomeWorldTime?.() ?? 0,
      );
    } else {
      this.stopWeaponAutoFire();
      this.gunJuice?.update(delta, null, false);
      this.tryStartShieldRecharge(input);
      if (this.aimControls) this.aimControls.pointerSpeed = 1;
      this.fpArmsViewModel?.setReloading(false);
      this.fpArmsViewModel?.setSprinting(false);
      if (this.camera) {
        this.fpArmsViewModel?.syncWeaponHandBinding(null, this.camera, false);
      }
      this.syncFpArmsToActiveWeapon();
    }

    if (this.yawRecoilRig && this.pitchRecoilRig) {
      this.applyActiveRecoilAim();
    }
    this.stabilizeCameraPitch();

    const moveMultiplier =
      active && meleeEquipped && isSprinting
        ? (active.config.moveSpeedMultiplier ?? KATANA_CONFIG.moveSpeedMultiplier ?? 1)
        : isCrouching && !isSliding
          ? CROUCH_SPEED_MULTIPLIER
          : 1;
    const speed = MOVE_SPEED * moveMultiplier * delta;

    this.right.crossVectors(this.forward, this.camera.up).normalize();

    const forwardSpeed = speed * (isSprinting ? SPRINT_MULTIPLIER : 1);

    let deltaX = 0;
    let deltaZ = 0;

    if (isSliding) {
      // Steer with look; turning bleeds extra speed (see SlideController).
      const slideMove = this.slide.tick(delta, this.forward.x, this.forward.z);
      deltaX = slideMove.x;
      deltaZ = slideMove.z;
    } else {
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
    }

    const jump = jumpFromSlide || (!wantsCrouch && !isSliding && jumpRequested);
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
      this.pendingSwayJump = true;
    }
    // Freeze sprint build-up whenever leaving the ground (jump or fall).
    // Jump-only / no sprint → 0 → minimum land-slide.
    if (wasGrounded && !this.physics.grounded) {
      this.airborneSlideChargeSec = this.sprintChargeSec;
    }
    if (this.physics.grounded) {
      this.locomotionJumping = false;
    }

    // Just landed — open a short window to slide without sprinting.
    // Holding C through the landing also starts a slide immediately.
    if (!wasGrounded && this.physics.grounded) {
      this.pendingSwayLand = true;
      this.landSlideGraceSec = LAND_SLIDE_GRACE_SEC;
      if (input.isPressed('KeyC') && !this.slide.isActive()) {
        const charge01 = Math.min(
          1,
          this.airborneSlideChargeSec / SPRINT_CHARGE_FULL_SEC,
        );
        this.slide.tryStart(this.forward.x, this.forward.z, charge01);
        this.locomotionSliding = this.slide.isActive();
      }
    }

    // Don't keep sliding once airborne (jump cancel / fall).
    if (!this.physics.grounded && this.slide.isActive()) {
      this.slide.cancel();
      this.locomotionSliding = false;
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

    if (active && meleeEquipped) {
      this.resolveActiveMeleeHit(projectiles);
    }

    this.tryDeployShieldDome(input, {
      isSprinting,
      isJumping: !this.physics.grounded,
      grounded: this.physics.grounded,
      shooting,
      reloading: ammoReloading,
      ads,
    });

    const groundedMoving = isMoving && this.physics.grounded && !isSliding;
    this.footstepSounds?.update(delta, groundedMoving, isSprinting);

    this.headBob.update(delta, groundedMoving, isSprinting);
    if (this.headRig) this.headBob.apply(this.headRig, isSprinting);
    this.fpArmsViewModel?.update(delta);
  }

  resize(): void {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.remoteHealthBar?.dispose();
    this.remoteHealthBar = null;
    this.enemyOutline?.detach();
    this.enemyOutline = null;
    this.damageNumberStack?.dispose();
    this.damageNumberStack = null;
    this.meleeHitFx?.dispose();
    this.meleeHitFx = null;
    this.shieldRechargeAuraFx?.dispose();
    this.shieldRechargeAuraFx = null;
    this.characterInstance?.dispose();
    this.characterInstance = null;
    this.displayedCharacterModelFile = null;
    this.displayedCharacterMeshFile = null;
    this.displayedCharacterSkinId = null;
    this.displayedOperatorId = null;
    this.remoteWeaponMount = null;
    this.remoteKatanaAxisDebug?.dispose();
    this.remoteKatanaAxisDebug = null;
    this.handRig = null;
    this.spineBone = null;
    this.lookRigFollowsHead = false;
    if (this.camera) {
      this.fpArmsViewModel?.syncWeaponHandBinding(null, this.camera, false);
    }
    this.scopeLens.dispose();
    this.loadout?.dispose();
    this.loadout = null;
    this.matchWeaponStatsById = null;
    this.grenadeViewModel?.dispose();
    this.grenadeViewModel = null;
    this.fpArmsViewModel?.dispose();
    this.fpArmsViewModel = null;
    this.gunJuice?.dispose();
    this.gunJuice = null;
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

  private updateThrowableInput(input: KeyboardInput, pointer: PointerInput): void {
    // Tap G while unequipped → equip only (do not start cooking on this press).
    if (input.isJustPressed('KeyG') && !this.throwableEquipped) {
      this.tryEquipThrowable();
      this.grenadeThrowHoldStartedAtMs = 0;
      return;
    }

    if (!this.throwableEquipped) {
      this.grenadeThrowHoldStartedAtMs = 0;
      return;
    }

    const gPressed = input.isPressed('KeyG');
    const shootPressed = pointer.isPressed(POINTER_SHOOT);
    const throwHeld = gPressed || shootPressed;

    if (
      (input.isJustPressed('KeyG') || pointer.isJustPressed(POINTER_SHOOT)) &&
      this.grenadeThrowHoldStartedAtMs <= 0
    ) {
      // Start measuring hold length; cooking waits for the grace threshold.
      this.grenadeThrowHoldStartedAtMs = performance.now();
    }

    if (throwHeld) {
      if (
        this.grenadeThrowHoldStartedAtMs > 0 &&
        !this.isCookingGrenade() &&
        (performance.now() - this.grenadeThrowHoldStartedAtMs) / 1000 >= GRENADE_COOK_HOLD_GRACE_SEC
      ) {
        this.beginGrenadeCook();
      }
    } else if (this.grenadeThrowHoldStartedAtMs > 0) {
      // Released before / after grace: tap throws uncooked; hold-release throws cooked.
      this.grenadeThrowHoldStartedAtMs = 0;
      this.tryThrowGrenade();
      return;
    } else if (this.isCookingGrenade()) {
      this.tryThrowGrenade();
      return;
    }

    if (this.isCookingGrenade() && this.getGrenadeFuseRemainingSec() <= 0) {
      this.tryThrowGrenade();
    }
  }

  private beginGrenadeCook(): void {
    if (!this.throwableEquipped || this.isCookingGrenade()) return;
    if (this.inventory.getGrenadeCount() <= 0) return;

    const worldTime = this.shieldDomeWorldTime?.() ?? 0;
    this.grenadeCookStartAt = worldTime;
    this.grenadeCookFuseEndAt = worldTime + GRENADE_FUSE_SEC;
    this.grenadeViewModel?.startCooking(this.grenadeCookFuseEndAt, worldTime);
  }

  private tryEquipThrowable(): void {
    if (this.inventory.getGrenadeCount() <= 0) return;

    this.stopWeaponAutoFire();
    this.loadout?.getActive()?.ammo.cancelReload();
    this.stopReloadAudio();

    if (this.loadout?.isMeleeEquipped()) {
      if (!this.loadout.tryEquipMelee(false, { bypassCooldown: true })) return;
      this.onMeleeEquipNetwork?.(false);
    }

    this.throwableEquipped = true;
    this.syncThrowableHolster();
    this.grenadeSounds?.playEquip();
  }

  private syncThrowableHolster(): void {
    if (!this.loadout || !this.camera) return;
    this.loadout.setMeshesVisible(!this.throwableEquipped);
    this.grenadeViewModel?.setVisible(this.throwableEquipped);
    this.syncFpArmsVisibility();
  }

  private syncFpArmsVisibility(): void {
    const meleeEquipped = this.loadout?.isMeleeEquipped() ?? false;
    const show =
      !this.throwableEquipped && !meleeEquipped && !!this.loadout?.getActive();
    this.fpArmsViewModel?.setVisible(show);
    if (!show) {
      this.fpArmsViewModel?.setReloading(false);
      this.fpArmsViewModel?.setSprinting(false);
      if (this.camera) {
        this.fpArmsViewModel?.syncWeaponHandBinding(null, this.camera, false);
      }
    }
    this.syncFpArmsToActiveWeapon();
  }

  /** Parent FPS arms under the active weapon so pose/sway move both together. */
  private syncFpArmsToActiveWeapon(): void {
    if (!this.fpArmsViewModel) return;
    if (this.throwableEquipped || this.loadout?.isMeleeEquipped()) {
      this.fpArmsViewModel.syncToWeapon(null);
      return;
    }
    const active = this.loadout?.getActive() ?? null;
    const grip = active?.config.view.fpArmsGrip;
    const adsBlend = this.weaponPose?.adsBlend ?? 0;
    this.fpArmsViewModel.syncToWeapon(active?.mesh ?? null, grip, adsBlend);
  }

  private tryThrowGrenade(): void {
    if (!this.throwableEquipped || !this.camera) return;

    const pose = this.computeGrenadeThrowPose();
    if (!pose) return;
    if (!this.inventory.trySpendGrenade()) {
      this.clearGrenadeCook();
      this.throwableEquipped = false;
      this.syncThrowableHolster();
      return;
    }

    const fuseRemainingSec = this.getGrenadeFuseRemainingSec();
    this.clearGrenadeCook();

    this.grenadeThrowKick.trigger();
    this.grenadeSounds?.playThrow();

    this.onGrenadeThrowNetwork?.({
      x: pose.x,
      y: pose.y,
      z: pose.z,
      dirX: pose.dirX,
      dirY: pose.dirY,
      dirZ: pose.dirZ,
      fuseRemainingSec,
    });

    if (this.inventory.getGrenadeCount() <= 0) {
      this.throwableEquipped = false;
      this.syncThrowableHolster();
    } else {
      this.grenadeViewModel?.triggerThrow();
    }
  }

  private computeGrenadeThrowPose(): (GrenadeThrowRequest & {
    velX: number;
    velY: number;
    velZ: number;
  }) | null {
    if (!this.camera) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    this.camera.getWorldDirection(this.aimDirection);

    readScreenHoldWorldPosition(
      this.camera,
      viewportWidth,
      viewportHeight,
      GRENADE_THROW_SCREEN_OFFSET_X * viewportWidth * 0.5,
      GRENADE_THROW_SCREEN_OFFSET_Y * viewportHeight * 0.5,
      GRENADE_THROW_ARM_DEPTH,
      this.muzzleOrigin,
    );

    const vel = computeGrenadeThrowVelocity(
      this.aimDirection.x,
      this.aimDirection.y,
      this.aimDirection.z,
    );

    return {
      x: this.muzzleOrigin.x,
      y: this.muzzleOrigin.y,
      z: this.muzzleOrigin.z,
      dirX: this.aimDirection.x,
      dirY: this.aimDirection.y,
      dirZ: this.aimDirection.z,
      velX: vel.velX,
      velY: vel.velY,
      velZ: vel.velZ,
    };
  }

  private tryToggleMeleeEquip(input: KeyboardInput): void {
    if (!this.loadout || !input.isJustPressed('KeyX')) return;

    const equip = !this.loadout.isMeleeEquipped();
    if (!this.loadout.tryEquipMelee(equip, { bypassCooldown: this.throwableEquipped })) return;

    if (equip) this.unequipThrowable();

    this.stopWeaponAutoFire();
    this.stopReloadAudio();
    this.onReloadStopNetwork?.();
    const active = this.loadout.getActive();
    if (!active) return;

    this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
    this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
    this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    this.syncFpArmsVisibility();
    this.onMeleeEquipNetwork?.(equip);
  }

  private trySwitchWeapon(input: KeyboardInput): void {
    if (!this.loadout) return;

    for (let slot = 0; slot < LOADOUT_SIZE; slot++) {
      const code = `Digit${slot + 1}`;
      if (!input.isJustPressed(code)) continue;
      if (this.tryResumeWeaponSlot(slot, true)) break;
    }
  }

  /** Switch to a weapon slot, or holster a throwable back to the already-active slot. */
  private tryResumeWeaponSlot(slotIndex: number, sendNetwork: boolean): boolean {
    if (!this.loadout || !this.camera) return false;

    const weaponId = this.loadout.getSlotWeaponId(slotIndex);
    if (!weaponId || weaponId === MELEE_WEAPON_ID) return false;

    const resumingFromThrowable =
      this.throwableEquipped &&
      !this.loadout.isMeleeEquipped() &&
      slotIndex === this.loadout.getActiveIndex();

    if (resumingFromThrowable) {
      this.unequipThrowable();
      this.stopWeaponAutoFire();
      const active = this.loadout.getActive();
      if (active) {
        this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
        this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
        this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
      }
      this.syncFpArmsVisibility();
      return true;
    }

    if (!this.loadout.trySwitch(slotIndex)) return false;

    this.unequipThrowable();
    this.stopWeaponAutoFire();
    this.stopReloadAudio();
    this.onReloadStopNetwork?.();
    const active = this.loadout.getActive();
    if (!active) return true;

    this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
    this.weaponPose?.startSwitch(this.loadout.getSwitchReadySec());
    this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    this.syncFpArmsVisibility();
    if (sendNetwork) {
      const switchedWeaponId = this.loadout.getActiveWeaponId();
      if (switchedWeaponId) this.onWeaponSwitchNetwork?.(slotIndex, switchedWeaponId);
    }
    return true;
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
    if (fireMode === 'semi') return pointer.isJustPressed(POINTER_SHOOT);
    if (fireMode === 'burst') {
      return this.burstShotsRemaining > 0 || pointer.isJustPressed(POINTER_SHOOT);
    }
    return pointer.isPressed(POINTER_SHOOT);
  }

  /** Draw the katana instantly for a V-key attack while a gun/throwable is out. */
  private quickDrawMeleeForAttack(): boolean {
    if (!this.loadout || !this.camera) return false;

    this.unequipThrowable();
    this.stopWeaponAutoFire();
    this.stopReloadAudio();
    this.onReloadStopNetwork?.();

    if (
      !this.loadout.tryEquipMelee(true, {
        bypassCooldown: true,
        skipSwitchDelay: true,
      })
    ) {
      return false;
    }

    const active = this.loadout.getActive();
    if (!active) return false;

    this.weaponPose?.cancelSwitch();
    this.weaponPose?.setViewConfig(active.config.view, active.config.adsTime);
    this.loadout.applyActiveRotation(getLocalWeaponBaseRotation(active.config), 'local');
    this.syncFpArmsVisibility();
    this.onMeleeEquipNetwork?.(true);
    return true;
  }

  private updateMeleeAttack(
    delta: number,
    input: KeyboardInput,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!this.loadout || !this.camera) return;

    const pressedV = input.isJustPressed('KeyV');
    // V always melee-attacks — auto-draw if a gun is currently equipped.
    if (pressedV && !this.loadout.isMeleeEquipped()) {
      if (!this.quickDrawMeleeForAttack()) return;
    }

    if (!this.loadout.isMeleeEquipped()) return;

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);

    const wantsAttack = pointer.isJustPressed(POINTER_SHOOT) || pressedV;
    if (!wantsAttack) return;

    if (!pressedV) {
      if (!this.loadout.isWeaponReady() || this.weaponPose?.isSwitching()) return;
      if (this.fireCooldown > 0) return;
    } else {
      // V interrupts holster/draw and ignores leftover gun fire cooldown.
      this.weaponPose?.cancelSwitch();
      this.fireCooldown = 0;
    }
    if (this.weaponPose?.isSlashing()) return;

    const active = this.loadout.getActive();
    if (!active || !active.ammo.tryShoot()) return;

    this.weaponSounds?.playSingleShot(active.config.sounds);
    this.weaponPose?.startSlash(KATANA_SLASH_DURATION_SEC);
    this.katanaSlashFx?.play(active.mesh);
    this.fireCooldown += active.fireInterval;
    this.meleeHitResolved = false;
    this.onMeleeAttackNetwork?.();
  }

  /** Resolve melee hits during the slash impact window, after movement for sprint closes. */
  private resolveActiveMeleeHit(projectiles: ProjectileManager | null): void {
    if (!this.loadout?.isMeleeEquipped() || !this.camera || !this.weaponPose) return;
    if (this.meleeHitResolved || !this.weaponPose.isSlashing()) return;
    if (!projectiles) return;

    const progress = this.weaponPose.getSlashProgress();
    if (progress < MELEE_IMPACT_PROGRESS_START) return;
    if (progress > MELEE_IMPACT_PROGRESS_END) return;

    const active = this.loadout.getActive();
    if (!active) return;

    const range = active.config.meleeRange ?? active.config.maxHitDistance ?? 2.8;
    if (projectiles.tryMeleeHit(
        this.camera,
        range,
        this.projectileSpawnOptions.ownerSessionId,
      )
    ) {
      this.meleeHitResolved = true;
    }
  }

  private updateFire(
    delta: number,
    pointer: PointerInput,
    projectiles: ProjectileManager | null,
  ): void {
    if (!this.loadout || this.throwableEquipped) return;

    const active = this.loadout.getActive();
    if (!active || active.config.fireMode === 'melee') return;

    if (pointer.isJustPressed(POINTER_SHOOT)) {
      this.fireTriggerHadShot = false;
      this.pendingShotEndEcho = false;
    }

    // Auto stops on release; burst continues until the burst is spent.
    if (!pointer.isPressed(POINTER_SHOOT) && active.config.fireMode === 'auto') {
      this.stopWeaponAutoFire();
    }

    if (pointer.isJustReleased(POINTER_SHOOT) && this.fireTriggerHadShot) {
      // Burst may still be finishing — defer the tail until the burst is spent.
      if (active.config.fireMode === 'burst' && this.burstShotsRemaining > 0) {
        this.pendingShotEndEcho = true;
      } else {
        this.weaponSounds?.playShotEndEcho();
      }
      this.fireTriggerHadShot = false;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);

    const wantsFire = this.isFiring(pointer, active.config.fireMode);
    if (!wantsFire) {
      if (this.pendingShotEndEcho && this.burstShotsRemaining <= 0) {
        this.weaponSounds?.playShotEndEcho();
        this.pendingShotEndEcho = false;
      }
      return;
    }

    if (!this.loadout.isWeaponReady() || this.weaponPose?.isSwitching()) return;
    if (this.fireCooldown > 0) return;

    if (
      active.config.fireMode === 'burst' &&
      this.burstShotsRemaining <= 0 &&
      pointer.isJustPressed(POINTER_SHOOT)
    ) {
      this.burstShotsRemaining = Math.max(1, active.config.burstCount ?? 3);
    }

    if (!this.shoot(projectiles)) {
      const state = active.ammo.getState();
      if (state.clip <= 0 && !state.reloading) {
        this.weaponSounds?.playOutOfAmmo();
        this.fireCooldown += active.fireInterval;
      }
      this.burstShotsRemaining = 0;
      if (this.pendingShotEndEcho) {
        this.weaponSounds?.playShotEndEcho();
        this.pendingShotEndEcho = false;
      }
      return;
    }

    this.fireTriggerHadShot = true;
    this.fireCooldown += active.fireInterval;

    if (
      active.config.autoReload === true &&
      active.ammo.getClip() <= 0
    ) {
      this.beginActiveWeaponReload();
    }

    if (active.config.fireMode === 'burst') {
      this.burstShotsRemaining = Math.max(0, this.burstShotsRemaining - 1);
      if (this.burstShotsRemaining === 0) {
        this.fireCooldown += Math.max(0, active.config.burstRecoverySec ?? 0);
        if (this.pendingShotEndEcho) {
          this.weaponSounds?.playShotEndEcho();
          this.pendingShotEndEcho = false;
        }
      }
    }
  }

  /** Start reload on the active gun (manual KeyR or auto-reload after empty). */
  private beginActiveWeaponReload(): boolean {
    if (!this.loadout || this.throwableEquipped) return false;
    if (this.loadout.isMeleeEquipped()) return false;
    if (!this.loadout.isWeaponReady() || this.weaponPose?.isSwitching()) return false;

    const active = this.loadout.getActive();
    if (!active || !active.ammo.tryReload()) return false;

    this.stopWeaponAutoFire();
    const weaponId = this.loadout.getActiveWeaponId();
    const durationSec = active.ammo.getReloadSequenceDuration();
    if (active.ammo.isShellReloadStyle()) {
      // Shell inserts play SFX as each round chambers — not a stretched mag clip.
      if (weaponId) this.onReloadNetwork?.(weaponId, durationSec);
    } else {
      const reloadSec = Math.max(0.05, Number(active.config.reloadSec) || 0.05);
      this.weaponSounds?.playReload(active.config.sounds, reloadSec);
      if (weaponId) this.onReloadNetwork?.(weaponId, reloadSec);
    }
    return true;
  }

  private stopWeaponAutoFire(): void {
    this.burstShotsRemaining = 0;
    const wasAutoFiring = this.localAutoFiring;
    this.localAutoFiring = false;
    this.weaponSounds?.stopAutoFire();
    if (wasAutoFiring) {
      this.onAutoFireStopNetwork?.();
    }
    if (this.pendingShotEndEcho) {
      this.weaponSounds?.playShotEndEcho();
      this.pendingShotEndEcho = false;
    }
  }

  private stopReloadAudio(): void {
    this.weaponSounds?.stopReload();
  }

  private shoot(projectiles: ProjectileManager | null): boolean {
    if (!this.camera || !this.loadout || !projectiles) return false;

    const active = this.loadout.getActive();
    const interruptedShellReload =
      !!active && active.ammo.isReloading() && active.ammo.isShellReloadStyle();
    if (!active || !active.ammo.tryShoot()) {
      this.stopWeaponAutoFire();
      return false;
    }

    if (interruptedShellReload) {
      this.weaponSounds?.stopReload();
      this.onReloadStopNetwork?.();
    }

    if (active.config.fireMode === 'auto' && active.config.sounds?.autoShot) {
      this.localAutoFiring = true;
      this.weaponSounds?.startAutoFire(active.config.sounds);
    } else {
      // Per-shot SFX (semi, burst, or auto weapons without a loop clip).
      this.weaponSounds?.playSingleShot(active.config.sounds);
      if (active.config.fireMode === 'auto') {
        this.localAutoFiring = true;
      }
    }

    active.feel.onShot(this.weaponPose?.adsBlend ?? 0);
    this.gunJuice?.onShot(active.config.id);
    this.object.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    active.mesh.updateMatrixWorld(true);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    // Gameplay aim = screen center / camera look (includes hierarchy camera recoil).
    readCrosshairWorldRay(
      this.camera,
      viewportWidth,
      viewportHeight,
      0,
      0,
      this.hitRayOrigin,
      this.hitRayDirection,
    );
    // Tracer / flash start at the true muzzle (no forward nudge — flash sits on the barrel tip).
    readWeaponMuzzleWorldPosition(active.mesh, this.muzzleOrigin);
    this.aimDirection.copy(this.hitRayDirection);

    const hasSideVents = Boolean(active.config.muzzleFlash.sideVents);
    const sideVentCount = hasSideVents
      ? readWeaponSideVentFlashOffsets(
          active.mesh,
          this.muzzleOrigin,
          this.hitRayDirection,
          this.sideVentOffsets,
        )
      : 0;

    const feet = this.object.position;
    this.shooterWorldPos.set(
      feet.x,
      feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5,
      feet.z,
    );

    const pelletCount = Math.max(1, Math.round(active.config.pelletCount ?? 1));
    const adsBlend = this.weaponPose?.adsBlend ?? 0;
    const adsSpreadScale = active.config.pelletAdsSpreadScale ?? 0.55;
    const spreadRad =
      (active.config.pelletSpreadRad ?? 0) *
      (1 - adsBlend * (1 - adsSpreadScale));

    // Buckshot scatter: rotate the pellet ring per shell and jitter each
    // pellet so shots pattern like a real shotgun, not a fixed hexagon. The
    // scattered direction is used for hits, tracer, AND the network message,
    // so what you see is exactly what everyone else sees.
    const ringPhase = Math.random() * Math.PI * 2;

    // ADS pulls the muzzle to screen center and tightens the pellet cone,
    // which shrinks the read of the blast — over-scale the flash and pellet
    // bolts while scoped so the feedback stays as loud as hipfire.
    const isMultiPellet = pelletCount > 1;
    const muzzleFlashScale = isMultiPellet ? 1 + adsBlend * 0.8 : 1 + adsBlend * 0.25;
    const pelletAdsBoost = 1 + adsBlend * 0.4;

    for (let pelletIndex = 0; pelletIndex < pelletCount; pelletIndex++) {
      readPelletDirection(
        this.hitRayDirection,
        pelletIndex,
        pelletCount,
        spreadRad,
        this.pelletDirection,
        pelletCount > 1
          ? {
              ringPhase,
              radiusScale: 0.55 + Math.random() * 0.45,
              angleJitter: (Math.random() - 0.5) * 0.5,
            }
          : undefined,
      );

      // Each pellet reads as its own projectile: slightly smaller bolt with
      // its own flight speed so the swarm spreads out in depth immediately.
      const isPellet = isMultiPellet;
      const pelletSpeed = isPellet
        ? active.config.projectileSpeed * (0.85 + Math.random() * 0.3)
        : active.config.projectileSpeed;

      projectiles.spawn(
        {
          hitRayOrigin: this.hitRayOrigin,
          // No clone: spawn() copies the direction before the next pellet iteration.
          hitRayDirection: isPellet ? this.pelletDirection : this.hitRayDirection,
          visualOrigin: this.muzzleOrigin,
          speed: pelletSpeed,
        },
        {
          ...this.projectileSpawnOptions,
          shooterId: this.projectileSpawnOptions.ownerSessionId || undefined,
          shooterWorldPos: this.shooterWorldPos,
          weaponId: active.config.id,
          maxHitDistance: active.config.maxHitDistance,
          // One muzzle flash for the whole shell — not per pellet.
          muzzleFlash: pelletIndex === 0 ? active.config.muzzleFlash : undefined,
          muzzleFlashScale,
          sideVentOffsets:
            pelletIndex === 0 && sideVentCount > 0 ? this.sideVentOffsets : undefined,
          boltColors: active.config.muzzleFlash?.colors,
          projectileStyle: active.config.projectileStyle,
          projectileGravity: active.config.projectileGravity,
          boltSizeScale: isPellet
            ? (0.7 + Math.random() * 0.3) * pelletAdsBoost
            : undefined,
        },
      );
      this.onShoot?.(this.muzzleOrigin, this.pelletDirection, { pelletIndex });
    }

    return true;
  }

  private getActiveFeel() {
    return this.loadout?.getActive()?.feel ?? null;
  }

  private applyActiveRecoilAim(): void {
    if (!this.yawRecoilRig || !this.pitchRecoilRig || !this.pitchRig || !this.aimRig) return;

    if (this.aimControls) {
      applyLookYaw(this.aimRig, this.aimControls.lookYaw);
      applyLookPitch(this.pitchRig, this.aimControls.lookPitch);
    }

    const basePitch = this.aimControls?.lookPitch ?? this.pitchRig.rotation.x;
    const feel = this.getActiveFeel();
    if (feel) {
      feel.applyAim(this.yawRecoilRig, this.pitchRecoilRig, basePitch);
    } else {
      this.yawRecoilRig.rotation.set(0, 0, 0);
      this.pitchRecoilRig.rotation.set(0, 0, 0);
    }
    const active = this.loadout?.getActive();
    if (
      active &&
      !this.throwableEquipped &&
      active.config.fireMode !== 'melee' &&
      !this.weaponPose?.isReloading
    ) {
      this.weaponSway?.applyCamera(this.yawRecoilRig, this.pitchRecoilRig);
    }
    if (this.grenadeThrowKick.isActive()) {
      this.grenadeThrowKick.applyAdditive(this.yawRecoilRig, this.pitchRecoilRig);
    }
    if (this.explosionCameraShake.isActive()) {
      this.explosionCameraShake.applyAdditive(this.yawRecoilRig, this.pitchRecoilRig);
    }
  }

  /** Keeps total pitch inside the vertical limit without euler gimbal spikes. */
  private stabilizeCameraPitch(): void {
    if (!this.aimControls || !this.pitchRig || !this.pitchRecoilRig) return;

    const offsetPitch = this.pitchRecoilRig.rotation.x;
    const combinedPitch = this.aimControls.lookPitch + offsetPitch;
    if (Math.abs(combinedPitch) <= AIM_PITCH_LIMIT) return;

    const clamped = THREE.MathUtils.clamp(combinedPitch, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT);
    const lookPitch = THREE.MathUtils.clamp(
      clamped - offsetPitch,
      -AIM_PITCH_LIMIT,
      AIM_PITCH_LIMIT,
    );

    if (Math.abs(lookPitch - this.aimControls.lookPitch) < 1e-5) return;

    this.aimControls.lookPitch = lookPitch;
    applyLookPitch(this.pitchRig, lookPitch);
  }

  private applyActiveWeaponPose(baseRotation?: THREE.Euler): void {
    const active = this.loadout?.getActive();
    if (!active) return;
    this.applyActiveWeaponPoseTo(active.mesh, baseRotation);
    this.syncActiveDigitalSight(active.mesh);
  }

  private applyActiveWeaponPoseTo(target: THREE.Object3D, baseRotation?: THREE.Euler): void {
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

    this.weaponPose?.apply(target, wallPullback, baseRotation);
  }

  private syncScopeLens(active: { mesh: THREE.Object3D; config: { view: { scopeLensAds?: boolean; adsFov?: number } } }): void {
    if (!this.camera || !active.config.view.scopeLensAds) {
      this.scopeLens.unbind();
      return;
    }

    // Hide the FP camera subtree (viewmodel + arms) while baking the lens feed.
    if (!this.scopeLens.bind(active.mesh, this.camera)) {
      this.scopeLens.unbind();
      return;
    }

    this.scopeLens.setZoom(
      this.weaponPose?.adsBlend ?? 0,
      active.config.view.adsFov ?? 18,
    );
  }

  private syncActiveDigitalSight(mesh: THREE.Object3D): void {
    if (!this.camera || !this.loadout) return;
    const active = this.loadout.getActive();
    if (!active || active.mesh !== mesh) return;

    const sightId = getEquippedSightForWeapon(active.weaponId);

    // Pistol (and any gun with sight_mount): real 3D optic on the rail.
    if (weaponUsesPhysicalSights(mesh)) {
      syncPhysicalSightOnWeapon(mesh, sightId, active.weaponId);
      this.syncScopeLens(active);
      return;
    }

    this.scopeLens.unbind();

    // Legacy digital reticle sprites for guns without a rail socket yet.
    const adsBlend = this.weaponPose?.adsBlend ?? 0;
    const sightEntry = getDigitalSightCatalogEntry(sightId);
    const sightAllowed = sightEntry != null && weaponHasDigitalSight(active.weaponId);
    if (sightEntry) {
      applyDigitalSightStyle(mesh, digitalSightStyleFromEntry(sightEntry));
    }
    updateDigitalSightAdsVisibility(mesh, adsBlend, sightAllowed);
    if (sightAllowed) {
      alignDigitalSightToCrosshair(mesh, this.camera);
    }
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
    // Slide clip already authorizes full-body orientation — look-pitch on Spine1
    // compounds with that pose and spins the torso every frame.
    if (
      this.targetSliding
      || this.displayedCharacterModelFile === CHARACTER_MODEL_FILES.sliding
    ) {
      return;
    }

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
