import * as THREE from 'three';
import type { ProjectileManager } from '../combat/ProjectileManager';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { readPlayerAim } from '../player/playerAim';
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
      _origin.set(spawn.x, spawn.y, spawn.z);
      _direction.set(spawn.dirX, spawn.dirY, spawn.dirZ);
      this.projectiles.spawn(_origin, _direction);
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

    this.projectiles.setPlayerHitHandlers(
      () => this.remotePlayers.getEnemyHitTargets(this.localCombat.teamId),
      (targetId) => this.roomClient.sendHit(targetId),
    );

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

  bindShoot(player: Player): void {
    player.setShootCallback((origin, direction) => {
      if (!this.roomClient.connected) return;
      this.roomClient.sendShoot({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        dirX: direction.x,
        dirY: direction.y,
        dirZ: direction.z,
      });
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
    const { yaw, pitch } = readPlayerAim(player.camera!);

    this.roomClient.sendMove(feet.x, feet.y + EYE_HEIGHT, feet.z, yaw, pitch);
  }

  interpolateRemotes(delta: number, camera: THREE.Camera): void {
    if (!this.roomClient.connected) return;
    this.remotePlayers.interpolate(delta, camera);
  }
}
