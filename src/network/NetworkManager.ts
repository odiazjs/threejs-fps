import * as THREE from 'three';
import type { ProjectileManager } from '../combat/ProjectileManager';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { readPlayerAim } from '../player/playerAim';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import type { LocalPickupHandler } from '../world/AmmoPickups';
import type { AmmoPickups } from '../world/AmmoPickups';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class NetworkManager {
  readonly roomClient = new RoomClient();
  private remotePlayers: RemotePlayers;
  private sendAccumulator = 0;
  private readonly sendInterval = 1 / 20;

  constructor(
    scene: THREE.Scene,
    private readonly projectiles: ProjectileManager,
    private readonly ammoPickups: AmmoPickups,
    private readonly onLocalAmmoPickup: LocalPickupHandler,
  ) {
    this.remotePlayers = new RemotePlayers(scene, this.roomClient);
    this.ammoPickups.bindNetwork(null, this.onLocalAmmoPickup);
  }

  async connect(): Promise<void> {
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
    await this.roomClient.connect();
    this.ammoPickups.bindNetwork(
      (index, feetX, feetZ) => this.roomClient.sendPickupAmmo(index, feetX, feetZ),
      this.onLocalAmmoPickup,
    );
    this.roomClient.bindState();
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
  }

  update(delta: number, player: Player, controls: PlayerControls): void {
    if (this.roomClient.connected) {
      this.remotePlayers.interpolate(delta);
    }

    if (!this.roomClient.connected || !controls.isLocked) return;

    this.sendAccumulator += delta;
    if (this.sendAccumulator < this.sendInterval) return;
    this.sendAccumulator = 0;

    const feet = player.object.position;
    const { yaw, pitch } = readPlayerAim(player.camera!);

    this.roomClient.sendMove(feet.x, feet.y + EYE_HEIGHT, feet.z, yaw, pitch);
  }
}
