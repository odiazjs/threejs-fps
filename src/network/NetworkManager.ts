import * as THREE from 'three';
import type { ProjectileManager } from '../combat/ProjectileManager';
import { getWeaponConfig } from '../content/weaponConfig';
import { isWeaponId } from '../../shared/content/weaponIds';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import type { LocalPickupHandler } from '../world/AmmoPickups';
import type { AmmoPickups } from '../world/AmmoPickups';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';
import type { LocalCombatState } from './types';
import type { GameJoinIntent } from '../auth/gameJoin';

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class NetworkManager {
  readonly roomClient = new RoomClient();
  private remotePlayers: RemotePlayers;
  private sendAccumulator = 0;
  private readonly sendInterval = 1 / 20;
  private localCombat: LocalCombatState = {
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    alive: true,
    teamId: 0,
    username: 'Player',
  };

  constructor(
    scene: THREE.Scene,
    private readonly projectiles: ProjectileManager,
    private readonly ammoPickups: AmmoPickups,
    private readonly onLocalAmmoPickup: LocalPickupHandler,
    private readonly onLocalPlayerChange: (state: LocalCombatState) => void,
    private readonly onKillFeed: (killerName: string, victimName: string) => void,
  ) {
    this.remotePlayers = new RemotePlayers(scene, this.roomClient);
    this.ammoPickups.bindNetwork(null, this.onLocalAmmoPickup);
  }

  async connect(username: string, joinIntent?: GameJoinIntent | null): Promise<void> {
    this.remotePlayers.bind();
    this.roomClient.onProjectileSpawn((spawn) => {
      _direction.set(spawn.dirX, spawn.dirY, spawn.dirZ);
      const weaponConfig = getWeaponConfig(spawn.weaponId ?? 'plasma_rifle');

      const shooter = spawn.shooterId
        ? this.remotePlayers.getPlayer(spawn.shooterId)
        : undefined;
      const weaponId = spawn.weaponId && isWeaponId(spawn.weaponId) ? spawn.weaponId : undefined;
      if (!shooter?.readActiveMuzzleWorldPosition(_origin, weaponId)) {
        _origin.set(spawn.x, spawn.y, spawn.z);
      }

      this.projectiles.spawn(_origin, _direction, {
        muzzleFlash: weaponConfig?.muzzleFlash,
      });
    });
    this.roomClient.onAmmoBoxChange((index, snapshot) => {
      this.ammoPickups.applySnapshot(index, snapshot);
    });
    this.roomClient.onAmmoPickupGranted(() => {
      this.onLocalAmmoPickup();
    });
    this.roomClient.onKillFeed((killerName, victimName) => {
      this.onKillFeed(killerName, victimName);
    });
    this.roomClient.onLocalPlayerChange((snapshot) => {
      this.localCombat = {
        hp: snapshot.hp,
        maxHp: PLAYER_MAX_HP,
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
    this.roomClient.bindState();

    const snapshot = this.roomClient.getLocalSnapshot();
    if (snapshot) {
      this.localCombat = {
        hp: snapshot.hp,
        maxHp: PLAYER_MAX_HP,
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
      () => this.remotePlayers.getEnemyHitTargets(this.localCombat.teamId),
      (targetId) => {
        const weaponId = player.getActiveWeaponId();
        this.roomClient.sendHit(targetId, weaponId);
        onLocalHit?.();
      },
    );

    player.setShootCallback((origin, direction) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendShoot({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        dirX: direction.x,
        dirY: direction.y,
        dirZ: direction.z,
        weaponId: player.getActiveWeaponId(),
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
    player.setProjectileSpawnOptions(snapshot.teamId);
    player.setFromSnapshot(snapshot, true);
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

  async disconnect(): Promise<void> {
    await this.roomClient.disconnect();
  }

  update(delta: number, player: Player, controls: PlayerControls): void {
    if (!this.roomClient.connected || !controls.isLocked || !this.localCombat.alive) {
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
