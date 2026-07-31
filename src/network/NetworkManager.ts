import * as THREE from 'three';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { getWeaponConfig } from '../content/weaponConfig';
import { isWeaponId, MELEE_WEAPON_ID } from '../../shared/content/weaponIds';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { CROUCH_EYE_HEIGHT } from '../../shared/combat/crouch';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import { getShieldCapacity } from '../../shared/combat/shield';
import { getShieldRechargeState } from '../../shared/combat/shieldRecharge';
import { DEFAULT_SHIELD_CHARGES, DEFAULT_GRENADES } from '../../shared/inventory/inventoryLimits';
import { computeGrenadeThrowVelocity } from '../../shared/combat/grenadePhysics';
import type { GrenadePlayerCollider } from '../../shared/combat/grenadePlayerCollision';
import { GRENADE_FUSE_SEC } from '../../shared/throwables/grenadeConfig';
import type { LocalPickupHandler } from '../world/AmmoPickups';
import type { AmmoPickups } from '../world/AmmoPickups';
import type { ShieldChargePickups } from '../world/ShieldChargePickups';
import type { GrenadePickups } from '../world/GrenadePickups';
import type { WeaponDrops } from '../world/WeaponDrops';
import type { GrenadeManager } from '../combat/GrenadeManager';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import type { ImpactSoundService } from '../audio/ImpactSoundService';
import type { WeaponSoundService } from '../audio/WeaponSoundService';
import type { BodyPartId } from '../../shared/combat/bodyParts';
import { scaleDamageForBodyPart } from '../../shared/combat/playerHitbox';
import type { LocalCombatState, LocalDamagedHandler, PlayerSnapshot } from './types';
import type { TeammateHudEntry } from '../ui/TeamHud';
import type { MinimapBlip } from '../ui/minimapTypes';
import type { GameJoinIntent } from '../auth/gameJoin';
import type { FpsJoinCredentials } from '../auth/joinCredentials';
import type { MapId } from '../../shared/level/maps';
import { readProjectileShooterWorldPos } from '../combat/damageIndicatorMath';
import { buildRemoteProjectileSpawn } from '../combat/remoteProjectileSpawn';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import { isCompetitiveGameMode } from '../../shared/combat/match';
import type {
  ShieldDomeManager,
  ShieldDomePlayerSync,
} from '../combat/ShieldDomeManager';
import type {
  ShieldDomeChargeManager,
  ShieldDomeChargePlayerSync,
} from '../combat/ShieldDomeChargeManager';
import { RemotePlayerUiVisibility } from '../player/remotePlayerUiVisibility';

const _shooterWorldPos = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
/** Local hit still counts as breaking a shield if state sync arrives shortly after. */
const LOCAL_HIT_SHIELD_BREAK_WINDOW_SEC = 0.75;

export class NetworkManager {
  readonly roomClient = new RoomClient();
  readonly remoteUiVisibility = new RemotePlayerUiVisibility();
  private remotePlayers: RemotePlayers;
  private impactSounds: ImpactSoundService | null = null;
  private weaponSounds: WeaponSoundService | null = null;
  private sendAccumulator = 0;
  private readonly sendInterval = 1 / 20;
  private localCombat: LocalCombatState = {
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shieldLevel: 1,
    shieldPoints: getShieldCapacity(1),
    shieldCapacity: getShieldCapacity(1),
    shieldCharges: DEFAULT_SHIELD_CHARGES,
    grenadeCount: DEFAULT_GRENADES,
    matchPlasmaMinerals: 0,
    shieldRecharging: false,
    shieldRechargeEndAt: 0,
    alive: true,
    teamId: 0,
    username: 'Player',
    shieldDomeChargeEndAt: 0,
    shieldDomeEndAt: 0,
    shieldDomeCooldownEndAt: 0,
  };
  private readonly recentLocalHits = new Map<string, number>();
  private readonly onLocalLoadoutHandlers: Array<(snapshot: PlayerSnapshot) => void> = [];
  private readonly onLocalDamagedHandlers: LocalDamagedHandler[] = [];
  private lastLoadoutKey = '';
  private onLocalShotFired: (() => void) | null = null;
  private onLocalShotHit:
    | ((damage: number, bodyPart: BodyPartId) => void)
    | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly projectiles: ProjectileManager,
    private readonly ammoPickups: AmmoPickups,
    private readonly shieldChargePickups: ShieldChargePickups,
    private readonly weaponDrops: WeaponDrops,
    private readonly grenadePickups: GrenadePickups | null,
    private readonly grenadeManager: GrenadeManager | null,
    private readonly onLocalAmmoPickup: LocalPickupHandler,
    private readonly onLocalGrenadePickup: () => void,
    private readonly onLocalShieldPickup: () => void,
    private readonly onLocalPlayerChange: (state: LocalCombatState) => void,
    private readonly onKillFeed: (
      killerId: string,
      killerName: string,
      victimName: string,
      extras?: { respawnDelaySec?: number; mineralsGranted?: number },
    ) => void,
  ) {
    this.remotePlayers = new RemotePlayers(scene, this.roomClient, this.remoteUiVisibility);
    this.remotePlayers.onShieldBreak((sessionId) => {
      this.handleRemoteShieldBreak(sessionId);
    });
    this.ammoPickups.bindNetwork(null, this.onLocalAmmoPickup);
  }

  async connect(credentials: FpsJoinCredentials, joinIntent?: GameJoinIntent | null): Promise<void> {
    this.remotePlayers.bind();
    this.roomClient.onProjectileSpawn((spawn) => {
      if (spawn.shooterId && spawn.shooterId === this.roomClient.sessionId) return;

      const shooter = spawn.shooterId
        ? this.remotePlayers.getPlayer(spawn.shooterId)
        : undefined;
      const built = buildRemoteProjectileSpawn(spawn, shooter);
      if (!built) return;

      readProjectileShooterWorldPos(spawn, _shooterWorldPos);
      const pelletIndex = spawn.pelletIndex ?? 0;

      this.projectiles.spawn(built.params, {
        visualOnly: true,
        ownerSessionId: spawn.shooterId ?? '',
        boltColors: built.boltColors,
        shooterId: spawn.shooterId,
        shooterWorldPos: _shooterWorldPos,
        weaponId: built.weaponId,
        muzzleFlash: pelletIndex === 0 ? built.muzzleFlash : undefined,
        sideVentOffsets: pelletIndex === 0 ? built.sideVentOffsets : undefined,
        projectileStyle: built.projectileStyle,
        projectileGravity: built.projectileGravity,
        boltSizeScale: built.boltSizeScale,
      });

      // Auto weapons without a loop clip (e.g. bio-liquid) play one SFX per tracer.
      // Shotgun follow-up pellets skip SFX — only pellet 0 (or omitted index) plays.
      const remoteSounds = getWeaponConfig(built.weaponId)?.sounds;
      if (
        spawn.shooterId &&
        pelletIndex === 0 &&
        remoteSounds &&
        !remoteSounds.autoShot &&
        remoteSounds.singleShot
      ) {
        _muzzlePos.copy(built.params.visualOrigin);
        this.weaponSounds?.playRemoteShot(
          spawn.shooterId,
          remoteSounds,
          'single',
          _muzzlePos,
        );
      }
    });
    this.roomClient.onWeaponShotSound((shot) => {
      if (shot.phase === 'autoStop') {
        this.weaponSounds?.playRemoteShot(shot.shooterId, undefined, shot.phase, _muzzlePos);
        return;
      }

      const weaponConfig = getWeaponConfig(shot.weaponId);
      if (!weaponConfig?.sounds) return;

      _muzzlePos.set(shot.x, shot.y, shot.z);
      const weaponId = isWeaponId(shot.weaponId) ? shot.weaponId : undefined;
      const shooter = shot.shooterId
        ? this.remotePlayers.getPlayer(shot.shooterId)
        : undefined;
      if (!shooter?.readActiveMuzzleWorldPosition(_muzzlePos, weaponId)) {
        _muzzlePos.set(shot.x, shot.y, shot.z);
      }

      this.weaponSounds?.playRemoteShot(
        shot.shooterId,
        weaponConfig.sounds,
        shot.phase,
        _muzzlePos,
      );
    });
    this.roomClient.onPlayerRemove((sessionId) => {
      this.weaponSounds?.stopRemoteAutoFire(sessionId);
    });
    this.roomClient.onAmmoBoxChange((index, snapshot) => {
      this.ammoPickups.applySnapshot(index, snapshot);
    });
    this.roomClient.onAmmoPickupGranted(() => {
      this.onLocalAmmoPickup();
    });
    this.roomClient.onShieldChargeChange((index, snapshot) => {
      this.shieldChargePickups.applySnapshot(index, snapshot);
    });
    this.roomClient.onGrenadePickupChange((index, snapshot) => {
      this.grenadePickups?.applySnapshot(index, snapshot);
    });
    this.roomClient.onGrenadePickupGranted((data) => {
      const snapshot = this.roomClient.getLocalSnapshot();
      if (snapshot) {
        this.localCombat = {
          ...this.localCombat,
          grenadeCount: snapshot.grenadeCount,
        };
        this.onLocalPlayerChange(this.localCombat);
      }
      this.onLocalGrenadePickup();
    });
    this.roomClient.onGrenadeThrown((data) => {
      const worldTime = this.getWorldTime();
      if (data.throwerId === this.roomClient.sessionId) {
        this.grenadeManager?.reconcileLocalThrow(data, worldTime);
        return;
      }
      this.grenadeManager?.spawnFromNetwork(data, worldTime);
    });
    this.roomClient.onGrenadeExplosion((data) => {
      this.grenadeManager?.detonateFromNetwork(data.x, data.y, data.z, data.id);
    });
    this.grenadeManager?.setDetonateReporter((id, x, y, z) => {
      this.roomClient.sendGrenadeDetonate({ id, x, y, z });
    });
    this.roomClient.onWeaponDropChange((index, snapshot) => {
      this.weaponDrops.applySnapshot(index, snapshot);
    });
    this.roomClient.onShieldChargePickupGranted(() => {
      const snapshot = this.roomClient.getLocalSnapshot();
      if (snapshot && snapshot.shieldCharges !== this.localCombat.shieldCharges) {
        this.localCombat = {
          ...this.localCombat,
          shieldCharges: snapshot.shieldCharges,
        };
        this.onLocalPlayerChange(this.localCombat);
      }
      this.onLocalShieldPickup();
    });
    this.roomClient.onKillFeed((killerId, killerName, victimName, extras) => {
      this.onKillFeed(killerId, killerName, victimName, extras);
    });
    this.roomClient.onLocalDamaged((damage) => {
      if (damage.shooterId) {
        this.remoteUiVisibility.recordCombat(damage.shooterId);
      }
      this.onLocalDamagedHandlers.forEach((handler) => handler(damage));
    });
    this.roomClient.onLocalPlayerChange((snapshot) => {
      this.localCombat = {
        hp: snapshot.hp,
        maxHp: PLAYER_MAX_HP,
        shieldLevel: snapshot.shieldLevel,
        shieldPoints: snapshot.shieldPoints,
        shieldCapacity: getShieldCapacity(snapshot.shieldLevel),
        shieldCharges: snapshot.shieldCharges,
        grenadeCount: snapshot.grenadeCount,
        matchPlasmaMinerals: snapshot.matchPlasmaMinerals,
        shieldRecharging: snapshot.shieldRecharging,
        shieldRechargeEndAt: snapshot.shieldRechargeEndAt,
        alive: snapshot.alive,
        teamId: snapshot.teamId,
        username: snapshot.username,
        shieldDomeChargeEndAt: snapshot.shieldDomeChargeEndAt,
        shieldDomeEndAt: snapshot.shieldDomeEndAt,
        shieldDomeCooldownEndAt: snapshot.shieldDomeCooldownEndAt,
      };
      // Position/move patches must not re-apply loadout (that was reverting Tab switches).
      const loadoutKey = [
        snapshot.weaponSlot0,
        snapshot.weaponSlot1,
        snapshot.weaponSlot2,
        snapshot.activeWeaponId,
      ].join('|');
      if (loadoutKey !== this.lastLoadoutKey) {
        this.lastLoadoutKey = loadoutKey;
        this.onLocalLoadoutHandlers.forEach((handler) => handler(snapshot));
      }
      this.onLocalPlayerChange(this.localCombat);
    });

    await this.roomClient.connect(credentials, joinIntent);
    this.ammoPickups.bindNetwork(
      (index, feetX, feetZ) => this.roomClient.sendPickupAmmo(index, feetX, feetZ),
      this.onLocalAmmoPickup,
    );
    this.grenadePickups?.bindNetwork(
      (index, feetX, feetZ) => this.roomClient.sendPickupGrenade(index, feetX, feetZ),
      this.onLocalGrenadePickup,
    );
    this.roomClient.bindState();

    const snapshot = this.roomClient.getLocalSnapshot();
    if (snapshot) {
      this.localCombat = {
        hp: snapshot.hp,
        maxHp: PLAYER_MAX_HP,
        shieldLevel: snapshot.shieldLevel,
        shieldPoints: snapshot.shieldPoints,
        shieldCapacity: getShieldCapacity(snapshot.shieldLevel),
        shieldCharges: snapshot.shieldCharges,
        grenadeCount: snapshot.grenadeCount,
        matchPlasmaMinerals: snapshot.matchPlasmaMinerals,
        shieldRecharging: snapshot.shieldRecharging,
        shieldRechargeEndAt: snapshot.shieldRechargeEndAt,
        alive: snapshot.alive,
        teamId: snapshot.teamId,
        username: snapshot.username,
        shieldDomeChargeEndAt: snapshot.shieldDomeChargeEndAt,
        shieldDomeEndAt: snapshot.shieldDomeEndAt,
        shieldDomeCooldownEndAt: snapshot.shieldDomeCooldownEndAt,
      };
      this.lastLoadoutKey = [
        snapshot.weaponSlot0,
        snapshot.weaponSlot1,
        snapshot.weaponSlot2,
        snapshot.activeWeaponId,
      ].join('|');
      this.onLocalLoadoutHandlers.forEach((handler) => handler(snapshot));
      this.onLocalPlayerChange(this.localCombat);
    }

    console.info('[Network] connected to room', this.roomClient.sessionId);
  }

  bindShoot(player: Player, onLocalHit?: () => void): void {
    this.projectiles.setPlayerHitHandlers(
      () =>
        this.remotePlayers.getEnemyHitTargets(
          this.localCombat.teamId,
          this.roomClient.sessionId ?? '',
        ),
      (targetId, point, bodyPart) => {
        this.impactSounds?.playEnemyHit();
        this.recordLocalHit(targetId);
        const weaponId = player.getActiveWeaponId();
        if (!weaponId) return;
        if (weaponId === MELEE_WEAPON_ID) {
          this.remotePlayers.getPlayer(targetId)?.playMeleeHitFx(point);
        }
        const config = getWeaponConfig(weaponId);
        const baseDamage = config?.damage ?? 0;
        const dealt = scaleDamageForBodyPart(baseDamage, bodyPart);
        this.onLocalShotHit?.(dealt, bodyPart);
        this.roomClient.sendHit(targetId, weaponId, bodyPart);
        onLocalHit?.();
      },
    );

    player.setShootCallback((origin, direction, options) => {
      if (!this.roomClient.connected) return;
      const weaponId = player.getActiveWeaponId();
      if (!weaponId) return;
      this.onLocalShotFired?.();
      const feet = player.object.position;
      this.roomClient.sendShoot({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        dirX: direction.x,
        dirY: direction.y,
        dirZ: direction.z,
        weaponId,
        pelletIndex: options?.pelletIndex,
        shooterWorldX: feet.x,
        shooterWorldY: feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5,
        shooterWorldZ: feet.z,
      });
    });

    player.setAutoFireStopCallback(() => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendAutoFireStop();
    });
    player.setReloadNetworkCallback((weaponId, durationSec) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendReload(weaponId, durationSec);
    });
    player.setReloadStopNetworkCallback(() => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendReloadStop();
    });
    player.setWeaponSwitchNetworkCallback((slot) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendSwitchWeapon(slot);
    });
    player.setMeleeEquipNetworkCallback((equipped) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendEquipMelee(equipped);
    });
    player.setMeleeAttackNetworkCallback(() => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendMeleeAttack();
    });
    player.setGrenadeThrowNetworkCallback((request) => {
      if (!this.roomClient.connected) return;
      const snapshot = this.roomClient.getLocalSnapshot();
      const vel = computeGrenadeThrowVelocity(request.dirX, request.dirY, request.dirZ);
      const fuseRemaining =
        typeof request.fuseRemainingSec === 'number' && Number.isFinite(request.fuseRemainingSec)
          ? Math.min(GRENADE_FUSE_SEC, Math.max(0, request.fuseRemainingSec))
          : GRENADE_FUSE_SEC;
      const fuseEndAt = this.getWorldTime() + fuseRemaining;
      this.grenadeManager?.spawnLocalThrow(
        this.roomClient.sessionId ?? '',
        snapshot?.teamId ?? 0,
        request.x,
        request.y,
        request.z,
        vel.velX,
        vel.velY,
        vel.velZ,
        fuseEndAt,
        this.getWorldTime(),
      );
      this.roomClient.sendThrowGrenade(request);
    });
  }

  applyLocalSpawn(player: Player, options?: { resetLook?: boolean }): void {
    const snapshot = this.roomClient.getLocalSnapshot();
    if (!snapshot) return;
    player.setEyePosition(
      snapshot.x,
      snapshot.y,
      snapshot.z,
      options?.resetLook ?? true,
      snapshot.yaw,
    );
    player.setProjectileSpawnOptions(snapshot.teamId, this.roomClient.sessionId ?? '');
    player.setFromSnapshot(snapshot, true);
    player.applyRespawnFromServer(snapshot);
  }

  sendStartShieldRecharge(): void {
    this.roomClient.sendStartShieldRecharge();
  }

  sendStartShieldDomeCharge(): void {
    this.roomClient.sendStartShieldDomeCharge();
  }

  // Scratch buffers reused every frame — these syncs run in the render loop,
  // so building fresh snapshot arrays per frame hammers the GC.
  private readonly shieldDomeSyncScratch: ShieldDomePlayerSync[] = [];
  private readonly shieldDomeChargeSyncScratch: ShieldDomeChargePlayerSync[] = [];

  syncShieldDomes(manager: ShieldDomeManager): void {
    const worldTime = this.getWorldTime();
    const players = this.shieldDomeSyncScratch;
    let count = 0;
    this.roomClient.forEachPlayerState((sessionId, state) => {
      let entry = players[count];
      if (!entry) {
        entry = {
          sessionId: '',
          shieldDomeEndAt: 0,
          shieldDomeCenterX: 0,
          shieldDomeCenterY: 0,
          shieldDomeCenterZ: 0,
        };
        players.push(entry);
      }
      entry.sessionId = sessionId;
      entry.shieldDomeEndAt = state.shieldDomeEndAt;
      entry.shieldDomeCenterX = state.shieldDomeCenterX;
      entry.shieldDomeCenterY = state.shieldDomeCenterY;
      entry.shieldDomeCenterZ = state.shieldDomeCenterZ;
      count++;
    });
    players.length = count;
    manager.syncFromPlayers(players, worldTime);
  }

  syncShieldDomeCharges(
    manager: ShieldDomeChargeManager,
    delta: number,
    localCamera: THREE.Camera | null,
  ): void {
    const worldTime = this.getWorldTime();
    const localSessionId = this.roomClient.sessionId ?? '';
    const players = this.shieldDomeChargeSyncScratch;
    let count = 0;
    this.roomClient.forEachPlayerState((sessionId, state) => {
      let entry = players[count];
      if (!entry) {
        entry = {
          sessionId: '',
          shieldDomeChargeEndAt: 0,
          shieldDomeCenterX: 0,
          shieldDomeCenterY: 0,
          shieldDomeCenterZ: 0,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
        };
        players.push(entry);
      }
      entry.sessionId = sessionId;
      entry.shieldDomeChargeEndAt = state.shieldDomeChargeEndAt;
      entry.shieldDomeCenterX = state.shieldDomeCenterX;
      entry.shieldDomeCenterY = state.shieldDomeCenterY;
      entry.shieldDomeCenterZ = state.shieldDomeCenterZ;
      entry.x = state.x;
      entry.y = state.y;
      entry.z = state.z;
      entry.yaw = state.yaw;
      entry.pitch = state.pitch;
      count++;
    });
    players.length = count;
    manager.syncFromPlayers(
      players,
      worldTime,
      delta,
      localSessionId,
      localCamera,
    );
    manager.update(delta, worldTime);
  }

  sendApplyLoadout(
    loadoutId: string,
    primaryWeaponId?: string,
    secondaryWeaponId?: string,
  ): boolean {
    if (!this.roomClient.connected) return false;
    this.roomClient.sendApplyLoadout(loadoutId, primaryWeaponId, secondaryWeaponId);
    return true;
  }

  /** Tell the room this client finished local asset/shader prep. */
  sendMatchClientReady(): void {
    if (!this.roomClient.connected) return;
    this.roomClient.sendMatchClientReady();
  }

  onApplyLoadoutResult(
    handler: (data: import('../../shared/network/applyLoadout').ApplyLoadoutResultMessage) => void,
  ): void {
    this.roomClient.onApplyLoadoutResult(handler);
  }

  sendDropWeapon(slot: number): void {
    this.roomClient.sendDropWeapon(slot);
  }

  sendDropShieldCharge(): void {
    this.roomClient.sendDropShieldCharge();
  }

  sendPickupWeaponDrop(index: number): void {
    this.roomClient.sendPickupWeaponDrop(index);
  }

  sendPickupShieldCharge(index: number): void {
    this.roomClient.sendPickupShieldCharge(index);
  }

  onLocalLoadoutChange(handler: (snapshot: PlayerSnapshot) => void): void {
    this.onLocalLoadoutHandlers.push(handler);
  }

  onWeaponPickupGranted(handler: (data: { index: number; weaponId: string }) => void): void {
    this.roomClient.onWeaponPickupGranted(handler);
  }

  onCraftItemGranted(
    handler: (data: import('../../shared/network/crafting').CraftItemGrantedMessage) => void,
  ): void {
    this.roomClient.onCraftItemGranted(handler);
  }

  sendCraftItem(itemId: string, feetX: number, feetZ: number): void {
    this.roomClient.sendCraftItem(itemId, feetX, feetZ);
  }

  sendInteractHarvestingBox(
    index: number,
    action: 'pickup' | 'drop' | 'install',
    feetX: number,
    feetZ: number,
  ): void {
    this.roomClient.sendInteractHarvestingBox(index, action, feetX, feetZ);
  }

  sendHarvestingBoxInstallHold(holding: boolean): void {
    this.roomClient.sendHarvestingBoxInstallHold(holding);
  }

  getHarvestingBoxSnapshots(): import('./types').HarvestingBoxSnapshot[] {
    return this.roomClient.getHarvestingBoxSnapshots();
  }

  onShieldChargeDropGranted(handler: (data: { index: number }) => void): void {
    this.roomClient.onShieldChargeDropGranted(handler);
  }

  onLocalDamaged(handler: LocalDamagedHandler): void {
    this.onLocalDamagedHandlers.push(handler);
  }

  /** Optional match-perf hooks (shots / predicted hit damage). */
  setMatchPerfHandlers(
    onShotFired: (() => void) | null,
    onShotHit: ((damage: number, bodyPart: BodyPartId) => void) | null,
  ): void {
    this.onLocalShotFired = onShotFired;
    this.onLocalShotHit = onShotHit;
  }

  getRoomId(): string | null {
    return this.roomClient.roomId;
  }

  sendTeamPing(x: number, y: number, z: number): void {
    if (!this.roomClient.connected) return;
    this.roomClient.sendTeamPing({ x, y, z });
  }

  onTeamPing(handler: (data: import('../../shared/network/ping').TeamPingMessage) => void): void {
    this.roomClient.onTeamPing(handler);
  }

  getLocalSnapshot() {
    return this.roomClient.getLocalSnapshot();
  }

  getLocalCombatState(): LocalCombatState {
    return this.localCombat;
  }

  getAllPlayers() {
    return this.roomClient.getAllPlayerSnapshots();
  }

  getWorldTime(): number {
    return this.roomClient.getWorldTime();
  }

  sendThrowGrenade(request: import('../../shared/network/grenade').GrenadeThrowRequest): void {
    this.roomClient.sendThrowGrenade(request);
  }

  getSessionId(): string {
    return this.roomClient.sessionId ?? '';
  }

  getFriendlyFire(): boolean {
    return this.roomClient.getFriendlyFire();
  }

  getRemotePlayer(sessionId: string): Player | undefined {
    return this.remotePlayers.getPlayer(sessionId);
  }

  /** Alive player capsules for grenade bounce (local + remotes). */
  getGrenadePlayerColliders(localPlayer: Player): GrenadePlayerCollider[] {
    const colliders: GrenadePlayerCollider[] = [];
    const localSessionId = this.roomClient.sessionId ?? '';

    if (localPlayer.isAlive()) {
      const feet = localPlayer.getFeetPosition();
      colliders.push({
        sessionId: localSessionId,
        feetX: feet.x,
        feetY: feet.y,
        feetZ: feet.z,
        crouching: localPlayer.getLocomotionState().isCrouching,
      });
    }

    for (const [sessionId, player] of this.remotePlayers.getAllPlayers()) {
      if (!player.isAlive()) continue;
      const feet = player.getFeetPosition();
      colliders.push({
        sessionId,
        feetX: feet.x,
        feetY: feet.y,
        feetZ: feet.z,
        crouching: player.getLocomotionState().isCrouching,
      });
    }

    return colliders;
  }

  getPlayerSnapshot(sessionId: string): (PlayerSnapshot & { sessionId: string }) | null {
    return (
      this.roomClient.getAllPlayerSnapshots().find((p) => p.sessionId === sessionId) ?? null
    );
  }

  getTeammateHudEntries(): TeammateHudEntry[] {
    const localTeamId = this.localCombat.teamId;
    const localSessionId = this.roomClient.sessionId;
    const worldTime = this.getWorldTime();
    const entries: TeammateHudEntry[] = [];

    for (const [sessionId, player] of this.remotePlayers.getAllPlayers()) {
      if (sessionId === localSessionId) continue;
      if (isTrainingBotSessionId(sessionId)) continue;
      if (player.getTeamId() !== localTeamId) continue;

      const shieldLevel = player.getShieldLevel();
      const recharge = getShieldRechargeState(
        player.getShieldRecharging(),
        player.getShieldRechargeEndAt(),
        worldTime,
      );

      entries.push({
        id: sessionId,
        username: player.getUsername(),
        hp: player.getHp(),
        maxHp: PLAYER_MAX_HP,
        alive: player.isAlive(),
        teamId: player.getTeamId(),
        shieldLevel,
        shieldPoints: player.getShieldPoints(),
        shieldCapacity: getShieldCapacity(shieldLevel),
        shieldRecharging: recharge.recharging,
        shieldRechargeProgress: recharge.progress,
      });
    }

    return entries.sort((a, b) => a.username.localeCompare(b.username));
  }

  getMinimapBlips(): MinimapBlip[] {
    const localTeamId = this.localCombat.teamId;
    const localSessionId = this.roomClient.sessionId;
    const blips: MinimapBlip[] = [];

    for (const [sessionId, player] of this.remotePlayers.getAllPlayers()) {
      if (sessionId === localSessionId) continue;
      if (!player.isAlive()) continue;
      if (player.getTeamId() !== localTeamId) continue;

      const feet = player.getFeetPosition();
      blips.push({
        x: feet.x,
        z: feet.z,
        kind: 'teammate',
      });
    }

    return blips;
  }

  playLocalShieldBreak(): void {
    this.impactSounds?.playShieldBreak();
  }

  private recordLocalHit(targetId: string): void {
    this.remoteUiVisibility.recordCombat(targetId);
    this.recentLocalHits.set(targetId, performance.now() / 1000);
  }

  private handleRemoteShieldBreak(sessionId: string): void {
    const hitAt = this.recentLocalHits.get(sessionId);
    if (hitAt == null) return;

    const elapsed = performance.now() / 1000 - hitAt;
    if (elapsed > LOCAL_HIT_SHIELD_BREAK_WINDOW_SEC) {
      this.recentLocalHits.delete(sessionId);
      return;
    }

    this.recentLocalHits.delete(sessionId);
    this.impactSounds?.playShieldBreakLocal();
  }

  setFootstepSoundService(service: FootstepSoundService | null): void {
    this.remotePlayers.setFootstepSoundService(service);
  }

  setWeaponSoundService(service: WeaponSoundService | null): void {
    this.weaponSounds = service;
  }

  setImpactSoundService(service: ImpactSoundService | null): void {
    this.impactSounds = service;
  }

  getMapId(): MapId {
    return this.roomClient.getMapId();
  }

  getMapIdIfSynced(): MapId | null {
    return this.roomClient.getMapIdIfSynced();
  }

  getMatchState() {
    return this.roomClient.getMatchState();
  }

  getLastPatchAgeMs(): number {
    return this.roomClient.getLastPatchAgeMs();
  }

  get isConnected(): boolean {
    return this.roomClient.connected;
  }

  async disconnect(): Promise<void> {
    await this.roomClient.disconnect();
  }

  update(delta: number, player: Player, controls: PlayerControls): void {
    if (!this.roomClient.connected || !controls.isPlaying || !this.localCombat.alive) {
      return;
    }

    const match = this.roomClient.getMatchState();
    if (isCompetitiveGameMode(match?.gameMode) && match?.phase !== 'playing') {
      return;
    }

    this.sendAccumulator += delta;
    if (this.sendAccumulator < this.sendInterval) return;
    this.sendAccumulator = 0;

    const feet = player.object.position;
    const { yaw, pitch } = player.getNetworkAim();

    const locomotion = player.getLocomotionState();
    const eyeY =
      locomotion.isCrouching || locomotion.isSliding
        ? feet.y + CROUCH_EYE_HEIGHT
        : feet.y + EYE_HEIGHT;

    this.roomClient.sendMove(
      feet.x,
      eyeY,
      feet.z,
      yaw,
      pitch,
      locomotion.isSprinting,
      locomotion.isWalking,
      locomotion.isWalkingBackward,
      locomotion.isJumping,
      locomotion.isCrouching || locomotion.isSliding,
      locomotion.isSliding,
    );
  }

  interpolateRemotes(delta: number, camera: THREE.Camera): void {
    if (!this.roomClient.connected) return;
    this.weaponSounds?.updateListener(camera);
    this.remotePlayers.interpolate(delta, camera, this.localCombat.teamId);
    this.weaponSounds?.updateRemoteAutoFirePositions((sessionId) => {
      const remote = this.remotePlayers.getPlayer(sessionId);
      if (!remote) return null;

      const weaponId = remote.getActiveWeaponId();
      if (remote.readActiveMuzzleWorldPosition(_muzzlePos, weaponId ?? undefined)) {
        return _muzzlePos;
      }

      const feet = remote.getFeetPosition();
      _muzzlePos.set(feet.x, feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5, feet.z);
      return _muzzlePos;
    });
  }
}
