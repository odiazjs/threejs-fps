import * as THREE from 'three';
import { Player } from '../player/Player';
import type { RoomClient } from './RoomClient';
import type { PlayerSnapshot } from './types';

export class RemotePlayers {
  private readonly players = new Map<string, Player>();

  constructor(
    private scene: THREE.Scene,
    private roomClient: RoomClient,
  ) {}

  bind(): void {
    this.roomClient.onPlayerAdd((sessionId, snapshot) => {
      this.addPlayer(sessionId, snapshot);
    });

    this.roomClient.onPlayerRemove((sessionId) => {
      this.removePlayer(sessionId);
    });

    this.roomClient.onPlayerChange((sessionId, snapshot) => {
      this.updatePlayer(sessionId, snapshot);
    });
  }
  private isLocal(sessionId: string): boolean {
    return sessionId === this.roomClient.sessionId;
  }

  private addPlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const player = Player.createRemote();
    player.setFromSnapshot(snapshot, true);
    player.attachToScene(this.scene);
    this.players.set(sessionId, player);
  }

  private updatePlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;
    this.players.get(sessionId)?.setFromSnapshot(snapshot);
  }

  interpolate(delta: number): void {
    for (const player of this.players.values()) {
      player.interpolateRemote(delta);
    }
  }

  private removePlayer(sessionId: string): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;
    player.dispose();
    this.players.delete(sessionId);
  }
}
