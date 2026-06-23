import * as THREE from 'three';
import type { ProjectileHitTarget } from '../combat/ProjectileManager';
import { Player } from '../player/Player';
import type { RoomClient } from './RoomClient';
import type { PlayerSnapshot } from './types';

const TEAM_COLORS = [0x6a9fd4, 0xe5a088] as const;

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

  getEnemyHitTargets(localTeamId: number): ProjectileHitTarget[] {
    const targets: ProjectileHitTarget[] = [];

    for (const [sessionId, player] of this.players) {
      if (!player.isAlive() || player.getTeamId() === localTeamId) continue;

      const feet = player.getFeetPosition();
      targets.push({
        sessionId,
        teamId: player.getTeamId(),
        feetX: feet.x,
        feetY: feet.y,
        feetZ: feet.z,
      });
    }

    return targets;
  }

  private isLocal(sessionId: string): boolean {
    return sessionId === this.roomClient.sessionId;
  }

  private addPlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const color = TEAM_COLORS[snapshot.teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
    const player = Player.createRemote(color);
    player.setFromSnapshot(snapshot, true);
    player.attachToScene(this.scene);
    this.players.set(sessionId, player);
  }

  private updatePlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;
    this.players.get(sessionId)?.setFromSnapshot(snapshot);
  }

  interpolate(delta: number, camera: THREE.Camera): void {
    for (const player of this.players.values()) {
      player.interpolateRemote(delta);
      player.updateRemoteHealthBar(camera);
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
