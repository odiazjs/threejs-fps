import * as THREE from 'three';
import type { ProjectileHitTarget } from '../combat/ProjectileManager';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import { Player } from '../player/Player';
import { preloadGameCharacterModels } from '../player/characterModel';
import { preloadWeaponMeshes } from '../content/weaponMeshes';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import type { RoomClient } from './RoomClient';
import type { PlayerSnapshot } from './types';

const _listenerPos = new THREE.Vector3();

export class RemotePlayers {
  private readonly players = new Map<string, Player>();
  private footsteps: FootstepSoundService | null = null;

  constructor(
    private scene: THREE.Scene,
    private roomClient: RoomClient,
  ) {
    void Promise.all([preloadGameCharacterModels(), preloadWeaponMeshes()]);
  }

  setFootstepSoundService(service: FootstepSoundService | null): void {
    this.footsteps = service;
    if (!service) return;
    for (const sessionId of this.players.keys()) {
      service.removeRemote(sessionId);
    }
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

  getEnemyHitTargets(localTeamId: number, localSessionId: string): ProjectileHitTarget[] {
    const targets: ProjectileHitTarget[] = [];

    for (const [sessionId, player] of this.players) {
      if (sessionId === localSessionId) continue;
      if (!player.isAlive()) continue;
      const isBot = isTrainingBotSessionId(sessionId);
      if (!isBot && player.getTeamId() === localTeamId) continue;

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

    void player.syncRemoteCharacterModel(this.roomClient.getWorldTime());
  }

  private updatePlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;

    player.setFromSnapshot(snapshot);
    void player.syncRemoteCharacterModel(this.roomClient.getWorldTime());
  }

  interpolate(delta: number, camera: THREE.Camera): void {
    const worldTime = this.roomClient.getWorldTime();
    const footsteps = this.footsteps;
    if (footsteps) {
      footsteps.updateListener(camera);
      camera.getWorldPosition(_listenerPos);
    }

    for (const [sessionId, player] of this.players) {
      player.interpolateRemote(delta);
      void player.syncRemoteCharacterModel(worldTime);
      player.updateRemoteWeapon(delta, worldTime);
      player.updateRemoteHealthBar(camera);
      player.updateDamageNumbers(delta, camera);

      if (!footsteps) continue;

      if (!player.isAlive()) {
        footsteps.removeRemote(sessionId);
        continue;
      }

      footsteps.updateRemote(
        sessionId,
        delta,
        player.getFeetPosition(),
        _listenerPos,
        player.getLocomotionState(),
      );
    }
  }

  private removePlayer(sessionId: string): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;
    player.dispose();
    this.footsteps?.removeRemote(sessionId);
    this.players.delete(sessionId);
  }
}
