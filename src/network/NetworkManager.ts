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
import { DEFAULT_SHIELD_CHARGES } from '../../shared/inventory/inventoryLimits';
import type { LocalPickupHandler } from '../world/AmmoPickups';
import type { AmmoPickups } from '../world/AmmoPickups';
import type { ShieldChargePickups } from '../world/ShieldChargePickups';
import type { WeaponDrops } from '../world/WeaponDrops';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import type { ImpactSoundService } from '../audio/ImpactSoundService';
import type { WeaponSoundService } from '../audio/WeaponSoundService';
import type { LocalCombatState, LocalDamagedHandler, PlayerSnapshot } from './types';
import type { TeammateHudEntry } from '../ui/TeamHud';
import type { GameJoinIntent } from '../auth/gameJoin';
import type { FpsJoinCredentials } from '../auth/joinCredentials';
import type { MapId } from '../../shared/level/maps';
import { readProjectileShooterWorldPos } from '../combat/damageIndicatorMath';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import type { ShieldDomeManager } from '../combat/ShieldDomeManager';
import type { ShieldDomeChargeManager } from '../combat/ShieldDomeChargeManager';
import { RemotePlayerUiVisibility } from '../player/remotePlayerUiVisibility';

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();
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

  constructor(
    scene: THREE.Scene,
    private readonly projectiles: ProjectileManager,
    private readonly ammoPickups: AmmoPickups,
    private readonly shieldChargePickups: ShieldChargePickups,
    private readonly weaponDrops: WeaponDrops,
    private readonly onLocalAmmoPickup: LocalPickupHandler,
    private readonly onLocalShieldPickup: () => void,
    private readonly onLocalPlayerChange: (state: LocalCombatState) => void,
    private readonly onKillFeed: (
      killerId: string,
      killerName: string,
      victimName: string,
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
      _direction.set(spawn.dirX, spawn.dirY, spawn.dirZ).normalize();
      const weaponConfig = getWeaponConfig(spawn.weaponId ?? 'plasma_rifle');
      const boltColors = weaponConfig?.muzzleFlash?.colors;

      const shooter = spawn.shooterId
        ? this.remotePlayers.getPlayer(spawn.shooterId)
        : undefined;
      const weaponId = spawn.weaponId && isWeaponId(spawn.weaponId) ? spawn.weaponId : undefined;

      if (!shooter?.readActiveMuzzleWorldPosition(_origin, weaponId)) {
        _origin.set(spawn.x, spawn.y, spawn.z);
      }

      readProjectileShooterWorldPos(spawn, _shooterWorldPos);

      this.projectiles.spawn(
        {
          hitRayOrigin: _origin,
          hitRayDirection: _direction,
          visualOrigin: _origin,
          speed: weaponConfig?.projectileSpeed ?? 100,
        },
        {
          visualOnly: true,
          muzzleFlash: weaponConfig?.muzzleFlash,
          boltColors,
          shooterId: spawn.shooterId,
          shooterWorldPos: _shooterWorldPos,
        },
      );
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
    this.roomClient.onKillFeed((killerId, killerName, victimName) => {
      this.onKillFeed(killerId, killerName, victimName);
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
        shieldRecharging: snapshot.shieldRecharging,
        shieldRechargeEndAt: snapshot.shieldRechargeEndAt,
        alive: snapshot.alive,
        teamId: snapshot.teamId,
        username: snapshot.username,
        shieldDomeChargeEndAt: snapshot.shieldDomeChargeEndAt,
        shieldDomeEndAt: snapshot.shieldDomeEndAt,
        shieldDomeCooldownEndAt: snapshot.shieldDomeCooldownEndAt,
      };
      this.onLocalLoadoutHandlers.forEach((handler) => handler(snapshot));
      this.onLocalPlayerChange(this.localCombat);
    });

    await this.roomClient.connect(credentials, joinIntent);
    this.ammoPickups.bindNetwork(
      (index, feetX, feetZ) => this.roomClient.sendPickupAmmo(index, feetX, feetZ),
      this.onLocalAmmoPickup,
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
        shieldRecharging: snapshot.shieldRecharging,
        shieldRechargeEndAt: snapshot.shieldRechargeEndAt,
        alive: snapshot.alive,
        teamId: snapshot.teamId,
        username: snapshot.username,
        shieldDomeChargeEndAt: snapshot.shieldDomeChargeEndAt,
        shieldDomeEndAt: snapshot.shieldDomeEndAt,
        shieldDomeCooldownEndAt: snapshot.shieldDomeCooldownEndAt,
      };
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
        this.roomClient.sendHit(targetId, weaponId, bodyPart);
        onLocalHit?.();
      },
    );

    player.setShootCallback((origin, direction) => {
      if (!this.roomClient.connected) return;
      const weaponId = player.getActiveWeaponId();
      if (!weaponId) return;
      const feet = player.object.position;
      this.roomClient.sendShoot({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        dirX: direction.x,
        dirY: direction.y,
        dirZ: direction.z,
        weaponId,
        shooterWorldX: feet.x,
        shooterWorldY: feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5,
        shooterWorldZ: feet.z,
      });
    });

    player.setAutoFireStopCallback(() => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendAutoFireStop();
    });
    player.setReloadNetworkCallback((weaponId) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendReload(weaponId);
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
  }

  applyLocalSpawn(player: Player): void {
    const snapshot = this.roomClient.getLocalSnapshot();
    if (!snapshot) return;
    player.setEyePosition(snapshot.x, snapshot.y, snapshot.z);
    player.setProjectileSpawnOptions(snapshot.teamId, this.roomClient.sessionId ?? '');
    player.setFromSnapshot(snapshot, true);
    player.applyLoadoutFromSnapshot(snapshot);
    player.refillAmmo();
  }

  sendStartShieldRecharge(): void {
    this.roomClient.sendStartShieldRecharge();
  }

  sendStartShieldDomeCharge(): void {
    this.roomClient.sendStartShieldDomeCharge();
  }

  syncShieldDomes(manager: ShieldDomeManager): void {
    const worldTime = this.getWorldTime();
    const players = this.roomClient.getAllPlayerSnapshots().map((snapshot) => ({
      sessionId: snapshot.sessionId,
      shieldDomeEndAt: snapshot.shieldDomeEndAt,
      shieldDomeCenterX: snapshot.shieldDomeCenterX,
      shieldDomeCenterY: snapshot.shieldDomeCenterY,
      shieldDomeCenterZ: snapshot.shieldDomeCenterZ,
    }));
    manager.syncFromPlayers(players, worldTime);
  }

  syncShieldDomeCharges(
    manager: ShieldDomeChargeManager,
    delta: number,
    localCamera: THREE.Camera | null,
  ): void {
    const worldTime = this.getWorldTime();
    const localSessionId = this.roomClient.sessionId ?? '';
    const players = this.roomClient.getAllPlayerSnapshots().map((snapshot) => ({
      sessionId: snapshot.sessionId,
      shieldDomeChargeEndAt: snapshot.shieldDomeChargeEndAt,
      shieldDomeCenterX: snapshot.shieldDomeCenterX,
      shieldDomeCenterY: snapshot.shieldDomeCenterY,
      shieldDomeCenterZ: snapshot.shieldDomeCenterZ,
      x: snapshot.x,
      y: snapshot.y,
      z: snapshot.z,
      yaw: snapshot.yaw,
      pitch: snapshot.pitch,
    }));
    manager.syncFromPlayers(
      players,
      worldTime,
      delta,
      localSessionId,
      localCamera,
    );
    manager.update(delta, worldTime);
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

  onShieldChargeDropGranted(handler: (data: { index: number }) => void): void {
    this.roomClient.onShieldChargeDropGranted(handler);
  }

  onLocalDamaged(handler: LocalDamagedHandler): void {
    this.onLocalDamagedHandlers.push(handler);
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

  getSessionId(): string {
    return this.roomClient.sessionId ?? '';
  }

  getRemotePlayer(sessionId: string): Player | undefined {
    return this.remotePlayers.getPlayer(sessionId);
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

  async disconnect(): Promise<void> {
    await this.roomClient.disconnect();
  }

  update(delta: number, player: Player, controls: PlayerControls): void {
    if (!this.roomClient.connected || !controls.isPlaying || !this.localCombat.alive) {
      return;
    }

    const match = this.roomClient.getMatchState();
    if (match?.gameMode === 'tdm' && match.phase !== 'playing') {
      return;
    }

    this.sendAccumulator += delta;
    if (this.sendAccumulator < this.sendInterval) return;
    this.sendAccumulator = 0;

    const feet = player.object.position;
    const { yaw, pitch } = player.getNetworkAim();

    const locomotion = player.getLocomotionState();
    const eyeY = locomotion.isCrouching
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
      locomotion.isCrouching,
    );
  }

  interpolateRemotes(delta: number, camera: THREE.Camera): void {
    if (!this.roomClient.connected) return;
    this.weaponSounds?.updateListener(camera);
    this.remotePlayers.interpolate(delta, camera);
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
