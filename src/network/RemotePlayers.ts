import * as THREE from 'three';
import type { ProjectileHitTarget } from '../combat/ProjectileManager';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import { Player } from '../player/Player';
import { RemotePlayerUiVisibility } from '../player/remotePlayerUiVisibility';
import { preloadGameCharacterModels } from '../player/characterModel';
import { preloadWeaponMeshes } from '../content/weaponMeshes';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import type { RoomClient } from './RoomClient';
import type { PlayerSnapshot } from './types';

const _listenerPos = new THREE.Vector3();

export class RemotePlayers {
  private readonly players = new Map<string, Player>();
  private footsteps: FootstepSoundService | null = null;
  private onShieldBreakHandler: ((sessionId: string) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private roomClient: RoomClient,
    private readonly uiVisibility: RemotePlayerUiVisibility,
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

  onShieldBreak(handler: (sessionId: string) => void): void {
    this.onShieldBreakHandler = handler;
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

  getAllPlayers(): ReadonlyMap<string, Player> {
    return this.players;
  }

  getEnemyHitTargets(localTeamId: number, localSessionId: string): ProjectileHitTarget[] {
    const targets: ProjectileHitTarget[] = [];
    const friendlyFire = this.roomClient.getFriendlyFire();

    for (const [sessionId, player] of this.players) {
      if (sessionId === localSessionId) continue;
      if (!player.isAlive()) continue;
      const isBot = isTrainingBotSessionId(sessionId);
      if (!friendlyFire && !isBot && player.getTeamId() === localTeamId) continue;

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
    player.setShieldBreakListener(() => {
      this.onShieldBreakHandler?.(sessionId);
    });
    player.setFromSnapshot(snapshot, true);
    player.attachToScene(this.scene);
    this.players.set(sessionId, player);

    void player.syncRemoteCharacterModel(this.roomClient.getWorldTime());
  }

  private updatePlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;

    if (snapshot.alive && !player.isAlive()) {
      this.uiVisibility.clearSession(sessionId);
    }

    player.setFromSnapshot(snapshot);
    void player.syncRemoteCharacterModel(this.roomClient.getWorldTime());
  }

  interpolate(delta: number, camera: THREE.Camera): void {
    const worldTime = this.roomClient.getWorldTime();
    const nowSec = performance.now() / 1000;
    this.uiVisibility.prune(nowSec);
    const footsteps = this.footsteps;
    if (footsteps) {
      footsteps.updateListener(camera);
      camera.getWorldPosition(_listenerPos);
    }

    for (const [sessionId, player] of this.players) {
      player.interpolateRemote(delta);
      void player.syncRemoteCharacterModel(worldTime);
      player.updateRemoteWeapon(delta, worldTime);
      const feet = player.getFeetPosition();
      const visibility = this.uiVisibility.resolve(
        sessionId,
        camera,
        feet,
        player.isAlive(),
        nowSec,
      );
      player.updateRemoteHealthBar(camera, visibility);
      player.updateDamageNumbers(delta, camera);
      player.updateRemoteShieldRecharge(delta, worldTime, camera);

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
    this.uiVisibility.clearSession(sessionId);
    this.players.delete(sessionId);
  }
}
