import * as THREE from 'three';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';

export class NetworkManager {
  readonly roomClient = new RoomClient();
  private remotePlayers: RemotePlayers;
  private sendAccumulator = 0;
  private readonly sendInterval = 1 / 20;
  private worldPosition = new THREE.Vector3();
  constructor(scene: THREE.Scene) {
    this.remotePlayers = new RemotePlayers(scene, this.roomClient);
  }
  async connect(): Promise<void> {
    this.remotePlayers.bind();
    await this.roomClient.connect();
    this.roomClient.bindState();
    console.info('[Network] connected to room', this.roomClient.sessionId);
  }
  update(delta: number, player: Player, controls: PlayerControls): void {
    if (this.roomClient.connected) {
      this.remotePlayers.interpolate(delta);
    }

    if (!this.roomClient.connected || !controls.isLocked) return;

    this.sendAccumulator += delta;
    if (this.sendAccumulator < this.sendInterval) return;
    this.sendAccumulator = 0;

    player.camera!.getWorldPosition(this.worldPosition);

    this.roomClient.sendMove(
      this.worldPosition.x,
      this.worldPosition.y,
      this.worldPosition.z,
      player.camera!.rotation.y,
      player.camera!.rotation.x,
    );  }
}
