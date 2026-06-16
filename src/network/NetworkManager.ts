import type { Scene } from 'three';
import type { Player } from '../player/Player';
import type { PlayerControls } from '../player/PlayerControls';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { RemotePlayers } from './RemotePlayers';
import { RoomClient } from './RoomClient';

export class NetworkManager {
  readonly roomClient = new RoomClient();
  private remotePlayers: RemotePlayers;
  private sendAccumulator = 0;
  private readonly sendInterval = 1 / 20;
  constructor(scene: Scene) {
    this.remotePlayers = new RemotePlayers(scene, this.roomClient);
  }
  async connect(): Promise<void> {
    this.remotePlayers.bind();
    await this.roomClient.connect();
    this.roomClient.bindState();
    console.info('[Network] connected to room', this.roomClient.sessionId);
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

    this.roomClient.sendMove(
      feet.x,
      feet.y + EYE_HEIGHT,
      feet.z,
      player.camera!.rotation.y,
      player.camera!.rotation.x,
    );  }
}
