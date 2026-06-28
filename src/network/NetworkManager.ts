import * as THREE from 'three';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { getWeaponConfig } from '../content/weaponConfig';
import { isWeaponId } from '../../shared/content/weaponIds';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import { getShieldCapacity } from '../../shared/combat/shield';
import { DEFAULT_SHIELD_CHARGES, MAX_SHIELD_CHARGES } from '../../shared/inventory/inventoryLimits';
import type { LocalPickupHandler } from '../world/AmmoPickups';
import type { AmmoPickups } from '../world/AmmoPickups';
import type { LocalShieldPickupHandler } from '../world/ShieldChargePickups';
import type { ShieldChargePickups } from '../world/ShieldChargePickups';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import type { ImpactSoundService } from '../audio/ImpactSoundService';
import type { LocalCombatState } from './types';
import type { GameJoinIntent } from '../auth/gameJoin';
import {
  readProjectileShooterWorldPos,
  resolveDamageHit,
  type RecentThreat,
} from '../combat/damageIndicatorMath';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _shooterWorldPos = new THREE.Vector3();
const MAX_RECENT_THREATS = 24;
/** Local hit still counts as breaking a shield if state sync arrives shortly after. */
const LOCAL_HIT_SHIELD_BREAK_WINDOW_SEC = 0.75;

export class NetworkManager {
  readonly roomClient = new RoomClient();
  private remotePlayers: RemotePlayers;
  private impactSounds: ImpactSoundService | null = null;
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
  };
  private readonly recentThreats: RecentThreat[] = [];
  private readonly recentLocalHits = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    private readonly projectiles: ProjectileManager,
    private readonly ammoPickups: AmmoPickups,
    private readonly shieldChargePickups: ShieldChargePickups,
    private readonly onLocalAmmoPickup: LocalPickupHandler,
    private readonly onLocalShieldPickup: LocalShieldPickupHandler,
    private readonly onLocalPlayerChange: (state: LocalCombatState) => void,
    private readonly onKillFeed: (killerName: string, victimName: string) => void,
  ) {
    this.remotePlayers = new RemotePlayers(scene, this.roomClient);
    this.remotePlayers.onShieldBreak((sessionId) => {
      this.handleRemoteShieldBreak(sessionId);
    });
    this.ammoPickups.bindNetwork(null, this.onLocalAmmoPickup);
    this.shieldChargePickups.bindNetwork(null, this.onLocalShieldPickup);
  }

  async connect(username: string, joinIntent?: GameJoinIntent | null): Promise<void> {
    this.remotePlayers.bind();
    this.roomClient.onProjectileSpawn((spawn) => {
      _direction.set(spawn.dirX, spawn.dirY, spawn.dirZ).normalize();
      const weaponConfig = getWeaponConfig(spawn.weaponId ?? 'plasma_rifle');

      const shooter = spawn.shooterId
        ? this.remotePlayers.getPlayer(spawn.shooterId)
        : undefined;
      const weaponId = spawn.weaponId && isWeaponId(spawn.weaponId) ? spawn.weaponId : undefined;

      if (!shooter?.readActiveMuzzleWorldPosition(_origin, weaponId)) {
        _origin.set(spawn.x, spawn.y, spawn.z);
      }

      if (
        spawn.shooterId &&
        spawn.shooterId !== this.roomClient.sessionId &&
        shooter?.isAlive()
      ) {
        readProjectileShooterWorldPos(spawn, _shooterWorldPos);
        this.recordThreat(
          spawn.shooterId,
          _shooterWorldPos,
          _direction,
          spawn.weaponId,
        );
      }

      this.projectiles.spawn(_origin, _direction, {
        muzzleFlash: weaponConfig?.muzzleFlash,
        speed: weaponConfig?.projectileSpeed,
      });
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
    this.roomClient.onKillFeed((killerName, victimName) => {
      this.onKillFeed(killerName, victimName);
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
      };
      this.onLocalPlayerChange(this.localCombat);
    });

    await this.roomClient.connect(username, joinIntent);
    this.ammoPickups.bindNetwork(
      (index, feetX, feetZ) => this.roomClient.sendPickupAmmo(index, feetX, feetZ),
      this.onLocalAmmoPickup,
    );
    this.shieldChargePickups.bindNetwork(
      (index, feetX, feetZ) =>
        this.roomClient.sendPickupShieldCharge(index, feetX, feetZ),
      this.onLocalShieldPickup,
      () => this.localCombat.shieldCharges < MAX_SHIELD_CHARGES,
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
      };
      this.onLocalPlayerChange(this.localCombat);
    }

    console.info('[Network] connected to room', this.roomClient.sessionId);
  }

  bindShoot(player: Player, onLocalHit?: () => void): void {
    this.projectiles.setPlayerHitHandlers(
      () =>
        this.remotePlayers.getEnemyHitTargets(
          this.localCombat.teamId,
          this.roomClient.sessionId,
        ),
      (targetId, _point) => {
        this.impactSounds?.playEnemyHit();
        this.recordLocalHit(targetId);
        const weaponId = player.getActiveWeaponId();
        this.roomClient.sendHit(targetId, weaponId);
        onLocalHit?.();
      },
    );

    player.setShootCallback((origin, direction) => {
      if (!this.roomClient.connected) return;
      const feet = player.object.position;
      this.roomClient.sendShoot({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        dirX: direction.x,
        dirY: direction.y,
        dirZ: direction.z,
        weaponId: player.getActiveWeaponId(),
        shooterWorldX: feet.x,
        shooterWorldY: feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5,
        shooterWorldZ: feet.z,
      });
    });
    player.setReloadNetworkCallback((weaponId) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendReload(weaponId);
    });
    player.setWeaponSwitchNetworkCallback((slot) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendSwitchWeapon(slot);
    });
  }

  applyLocalSpawn(player: Player): void {
    const snapshot = this.roomClient.getLocalSnapshot();
    if (!snapshot) return;
    player.setEyePosition(snapshot.x, snapshot.y, snapshot.z);
    player.setProjectileSpawnOptions(snapshot.teamId, this.roomClient.sessionId);
    player.setFromSnapshot(snapshot, true);
    player.refillAmmo();
  }

  sendStartShieldRecharge(): void {
    this.roomClient.sendStartShieldRecharge();
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
    return this.roomClient.sessionId;
  }

  resolveDamageHit(player: Player) {
    const sessionId = this.roomClient.sessionId;
    if (!sessionId) return null;

    this.pruneThreats(this.getWorldTime());
    return resolveDamageHit(
      player,
      this.remotePlayers,
      this.localCombat.teamId,
      sessionId,
      this.recentThreats,
      this.getWorldTime(),
      (targetId, out) => this.readPlayerSnapshotChest(targetId, out),
    );
  }

  private readPlayerSnapshotChest(sessionId: string, out: THREE.Vector3): boolean {
    for (const snapshot of this.roomClient.getAllPlayerSnapshots()) {
      if (snapshot.sessionId !== sessionId) continue;
      out.set(snapshot.x, snapshot.y - EYE_HEIGHT + PLAYER_HIT_CAPSULE_HEIGHT * 0.5, snapshot.z);
      return true;
    }
    return false;
  }

  private recordThreat(
    shooterId: string,
    shooterWorldPos: THREE.Vector3,
    direction: THREE.Vector3,
    weaponId?: string,
  ): void {
    this.recentThreats.push({
      shooterId,
      shooterWorldPos: shooterWorldPos.clone(),
      direction: direction.clone(),
      weaponId,
      time: this.getWorldTime(),
    });
    if (this.recentThreats.length > MAX_RECENT_THREATS) {
      this.recentThreats.shift();
    }
  }

  private pruneThreats(now: number): void {
    const cutoff = now - 2.5;
    while (this.recentThreats.length > 0 && this.recentThreats[0]!.time < cutoff) {
      this.recentThreats.shift();
    }
  }

  playLocalShieldBreak(): void {
    this.impactSounds?.playShieldBreak();
  }

  private recordLocalHit(targetId: string): void {
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

  setImpactSoundService(service: ImpactSoundService | null): void {
    this.impactSounds = service;
  }

  async disconnect(): Promise<void> {
    await this.roomClient.disconnect();
  }

  update(delta: number, player: Player, controls: PlayerControls): void {
    if (!this.roomClient.connected || !controls.isPlaying || !this.localCombat.alive) {
      return;
    }

    this.sendAccumulator += delta;
    if (this.sendAccumulator < this.sendInterval) return;
    this.sendAccumulator = 0;

    const feet = player.object.position;
    const { yaw, pitch } = player.getNetworkAim();

    const locomotion = player.getLocomotionState();

    this.roomClient.sendMove(
      feet.x,
      feet.y + EYE_HEIGHT,
      feet.z,
      yaw,
      pitch,
      locomotion.isSprinting,
      locomotion.isWalking,
      locomotion.isJumping,
    );
  }

  interpolateRemotes(delta: number, camera: THREE.Camera): void {
    if (!this.roomClient.connected) return;
    this.remotePlayers.interpolate(delta, camera);
  }
}
