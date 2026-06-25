import * as THREE from 'three';
import type { ProjectileHitTarget } from '../combat/ProjectileManager';
import { Player } from '../player/Player';
import { preloadGameCharacterModels } from '../player/characterModel';
import type { RoomClient } from './RoomClient';
import type { PlayerSnapshot } from './types';
import { isWeaponId } from '../../shared/content/weaponIds';

export class RemotePlayers {
  private readonly players = new Map<string, Player>();

  constructor(
    private scene: THREE.Scene,
    private roomClient: RoomClient,
  ) {
    void preloadGameCharacterModels();
  }

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

  getPlayer(sessionId: string): Player | undefined {
    return this.players.get(sessionId);
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

    const player = Player.createRemote();
    player.setFromSnapshot(snapshot, true);
    player.attachToScene(this.scene);
    this.players.set(sessionId, player);

    void player.syncRemoteCharacterModel();
  }

  private updatePlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;

    player.setFromSnapshot(snapshot);
    void player.syncRemoteCharacterModel();
  }

  interpolate(delta: number, camera: THREE.Camera): void {
    const worldTime = this.roomClient.getWorldTime();
    for (const player of this.players.values()) {
      player.interpolateRemote(delta);
      void player.syncRemoteCharacterModel();
      player.updateRemoteWeapon(delta, worldTime);
      player.updateRemoteHealthBar(camera);
      player.updateDamageNumbers(delta, camera);
    }
  }

  showDamage(sessionId: string, amount: number): void {
    this.players.get(sessionId)?.showDamageNumber(amount);
  }

  private removePlayer(sessionId: string): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;
    player.dispose();
    this.players.delete(sessionId);
  }
}
